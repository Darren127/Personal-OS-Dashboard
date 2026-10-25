import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { todayIn } from "@/lib/dates";
import type { Json } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/server";
import { BETAS, MAX_STEPS_PER_TURN, estimateCostUsd, type AiConfig } from "./config";
import { buildTurnContext } from "./context";
import { describeApiError, type Streamer } from "./model";
import { SYSTEM_PROMPT } from "./prompt";
import { TOOL_DEFINITIONS, getTool, type ToolContext } from "./tools";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;
type ToolUse = Anthropic.Beta.Messages.BetaToolUseBlock;

export type ChatEvent =
  | { type: "conversation"; id: string; title: string }
  | { type: "step" }
  | { type: "text"; delta: string }
  | { type: "progress"; delta: string }
  | { type: "retry" }
  | {
      type: "tool";
      toolUseId: string;
      name: string;
      summary: string;
      status: "done" | "executed" | "proposed" | "failed" | "invalid" | "skipped";
      actionId?: string;
      error?: string;
    }
  | { type: "notice"; level: "info" | "warning" | "error"; message: string }
  | { type: "done"; costUsd: number };

export type CompanionPrefs = {
  timezone: string;
  workDayStart: string;
  workDayEnd: string;
  displayName: string | null;
  weekStartsOn: number;
  aiAutoExecuteLowRisk: boolean;
};

/** Total estimated spend for the current calendar month (UTC). */
export async function monthToDateCostUsd(supabase: Db, now = new Date()) {
  const month = `${now.toISOString().slice(0, 7)}-01`;
  const { data, error } = await supabase.from("ai_usage_monthly").select("*").eq("month", month);
  if (error) throw new Error(`Failed to read AI usage: ${error.message}`);
  return data.reduce((sum, r) => sum + estimateCostUsd(r.model ?? "", {
    input_tokens: Number(r.input_tokens ?? 0),
    output_tokens: Number(r.output_tokens ?? 0),
    cache_read_input_tokens: Number(r.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens: Number(r.cache_creation_input_tokens ?? 0),
  }), 0);
}

function textOf(content: Anthropic.Beta.Messages.BetaContentBlock[]) {
  return content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n\n").trim();
}

function json(value: unknown, max = 20_000) {
  const s = JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…(truncated)` : s;
}

/**
 * Runs one user turn: sends the message with a fresh context note, streams the
 * reply, runs or queues tool calls, and stores every message exactly as sent.
 *
 * History is append-only and replayed verbatim (the API ties the model's
 * reasoning to the exact history). Nothing from this turn is stored until the
 * first model response arrives, so a failed request leaves no partial turn.
 */
export async function runCompanionTurn(opts: {
  supabase: Db;
  config: AiConfig;
  streamer: Streamer;
  prefs: CompanionPrefs;
  conversationId: string | null;
  userText: string;
  emit: (e: ChatEvent) => void;
  now?: Date;
}) {
  const { supabase, config, streamer, prefs, emit } = opts;
  const now = opts.now ?? new Date();
  const today = todayIn(prefs.timezone, now);
  let costUsd = 0;

  if (config.monthlyBudgetUsd !== null) {
    const spent = await monthToDateCostUsd(supabase, now);
    if (spent >= config.monthlyBudgetUsd) {
      emit({
        type: "notice",
        level: "error",
        message: `This month's AI budget of US$${config.monthlyBudgetUsd} has been reached (about US$${spent.toFixed(2)} used). Raise AI_MONTHLY_BUDGET_USD to continue.`,
      });
      emit({ type: "done", costUsd: 0 });
      return;
    }
  }

  // Load the existing conversation, if any.
  let conversationId = opts.conversationId;
  const history: MessageParam[] = [];
  let since: string | null = null;
  if (conversationId) {
    const conv = await supabase.from("conversations").select("id").eq("id", conversationId).maybeSingle();
    if (conv.error || !conv.data) {
      emit({ type: "notice", level: "error", message: "That conversation no longer exists." });
      emit({ type: "done", costUsd: 0 });
      return;
    }
    const rows = await supabase.from("conversation_messages").select("role, content, created_at")
      .eq("conversation_id", conversationId).order("seq");
    if (rows.error) throw new Error(`Failed to load conversation: ${rows.error.message}`);
    for (const r of rows.data) history.push({ role: r.role, content: r.content } as MessageParam);
    since = rows.data.at(-1)?.created_at ?? null;
  }

  const contextNote = await buildTurnContext(supabase, {
    today, now, prefs, conversationId, since, userText: opts.userText,
  });
  const turnStart: MessageParam[] = [
    { role: "user", content: [{ type: "text", text: opts.userText }] },
    // Appended (never edited) operator note with today's data.
    { role: "system", content: [{ type: "text", text: contextNote }] },
  ];
  const messages = [...history, ...turnStart];

  let toolCtx: ToolContext = { supabase, today, timezone: prefs.timezone, weekStartsOn: prefs.weekStartsOn, conversationId };

  async function store(rows: { role: string; content: unknown; text_content?: string; visible: boolean; usage?: Record<string, unknown> }[]) {
    const { data, error } = await supabase.from("conversation_messages").insert(
      rows.map((r) => ({
        conversation_id: conversationId!,
        role: r.role,
        content: r.content as NonNullable<Json>,
        text_content: r.text_content ?? "",
        visible: r.visible,
        ...r.usage,
      })),
    ).select("id");
    if (error) throw new Error(`Failed to save message: ${error.message}`);
    return data.map((d) => d.id);
  }

  for (let step = 0; step < MAX_STEPS_PER_TURN; step++) {
    if (step > 0) emit({ type: "step" });

    let message;
    try {
      message = await streamer(
        {
          model: config.model,
          max_tokens: 32000,
          system: SYSTEM_PROMPT,
          tools: TOOL_DEFINITIONS,
          messages,
          thinking: {
            type: "adaptive",
            display: "updates",
            // If the stored history no longer matches what produced an old
            // reasoning block (e.g. after an app update), drop that block
            // instead of failing the request.
            block_binding: { prefix_mismatch_behavior: "drop_block" },
          },
          output_config: { effort: config.effort },
          fallbacks: "default",
          cache_control: { type: "ephemeral" },
          betas: [...BETAS],
        },
        (e) => emit(e),
      );
    } catch (err) {
      console.error("[companion] model request failed", err);
      emit({ type: "notice", level: "error", message: describeApiError(err) });
      break;
    }

    // First successful response: create the conversation and store the turn.
    if (step === 0) {
      if (!conversationId) {
        const title = opts.userText.replace(/\s+/g, " ").trim().slice(0, 80);
        const conv = await supabase.from("conversations").insert({ title }).select("id, title").single();
        if (conv.error) throw new Error(`Failed to create conversation: ${conv.error.message}`);
        conversationId = conv.data.id;
        toolCtx = { ...toolCtx, conversationId };
        emit({ type: "conversation", id: conv.data.id, title: conv.data.title ?? title });
      } else {
        await supabase.from("conversations").update({ archived_at: null }).eq("id", conversationId); // bumps updated_at
      }
      await store([
        { role: "user", content: turnStart[0].content, text_content: opts.userText, visible: true },
        { role: "system", content: turnStart[1].content, text_content: contextNote, visible: false },
      ]);
    }

    // An assistant turn can't be empty when replayed; record a visible marker.
    if (message.content.length === 0) {
      message.content = [{ type: "text", text: "[No response.]", citations: null }];
    }
    const usage = message.usage;
    costUsd += estimateCostUsd(message.model, usage);
    const toolUses = message.content.filter((b): b is ToolUse => b.type === "tool_use");
    const [assistantId] = await store([{
      role: "assistant",
      content: message.content,
      text_content: textOf(message.content),
      visible: true,
      usage: {
        model: message.model,
        stop_reason: message.stop_reason,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      },
    }]);
    messages.push({ role: "assistant", content: message.content });

    if (message.model !== config.model && message.content.some((b) => b.type === "fallback")) {
      emit({ type: "notice", level: "info", message: `Answered by the fallback model (${message.model}) after a safety filter declined the request.` });
    }

    // Every tool call must get a result, even when it isn't run; otherwise the
    // conversation can't continue.
    const skipReason =
      message.stop_reason === "refusal" ? "Not run: the response was declined."
      : message.stop_reason === "max_tokens" ? "Not run: the response was cut off before the tool input was complete."
      : null;

    if (message.stop_reason === "refusal") {
      emit({ type: "notice", level: "warning", message: "Claude declined to answer this. Try rephrasing the request." });
    } else if (message.stop_reason === "max_tokens" && !toolUses.length) {
      emit({ type: "notice", level: "warning", message: "The reply was cut off because it hit the length limit." });
    }

    if (toolUses.length) {
      const results: ToolResult[] = [];
      for (const use of toolUses) {
        if (skipReason) {
          results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: skipReason });
          emit({ type: "tool", toolUseId: use.id, name: use.name, summary: use.name, status: "skipped" });
          continue;
        }
        results.push(await runTool(use, toolCtx, prefs.aiAutoExecuteLowRisk, assistantId, emit));
      }
      await store([{ role: "user", content: results, visible: false }]);
      messages.push({ role: "user", content: results });
      if (skipReason) break;
      if (step === MAX_STEPS_PER_TURN - 1) {
        emit({ type: "notice", level: "warning", message: `Stopped after ${MAX_STEPS_PER_TURN} steps. Send another message to continue.` });
      }
      continue;
    }

    if (message.stop_reason === "pause_turn") continue;
    break;
  }

  emit({ type: "done", costUsd: Math.round(costUsd * 10000) / 10000 });
}

/**
 * Validate and run (or queue) one tool call. Returns the tool_result to send
 * back. Write actions are logged; their result tells the model truthfully
 * whether anything happened.
 */
async function runTool(
  use: ToolUse,
  ctx: ToolContext,
  autoExecuteLowRisk: boolean,
  messageId: string,
  emit: (e: ChatEvent) => void,
): Promise<ToolResult> {
  const def = getTool(use.name);
  if (!def) {
    emit({ type: "tool", toolUseId: use.id, name: use.name, summary: use.name, status: "invalid", error: "Unknown tool" });
    return { type: "tool_result", tool_use_id: use.id, is_error: true, content: `Unknown tool: ${use.name}` };
  }

  const parsed = def.schema.safeParse(use.input);
  if (!parsed.success) {
    emit({ type: "tool", toolUseId: use.id, name: use.name, summary: use.name, status: "invalid", error: "Invalid input" });
    return {
      type: "tool_result",
      tool_use_id: use.id,
      is_error: true,
      content: json({ INVALID_INPUT: parsed.error.issues.map((i: { path: PropertyKey[]; message: string }) => `${i.path.map(String).join(".")}: ${i.message}`), received: use.input }),
    };
  }

  const input = parsed.data;
  let summary = use.name;
  try {
    summary = (await def.summarize(input, ctx)).slice(0, 500);
    const risk = typeof def.risk === "function" ? await def.risk(input, ctx) : def.risk;

    if (risk === "read") {
      const outcome = await def.execute(input, ctx);
      emit({ type: "tool", toolUseId: use.id, name: use.name, summary, status: outcome.ok ? "done" : "failed", error: outcome.ok ? undefined : outcome.error });
      return outcome.ok
        ? { type: "tool_result", tool_use_id: use.id, content: json(outcome.result) }
        : { type: "tool_result", tool_use_id: use.id, is_error: true, content: outcome.error };
    }

    const log = {
      tool_name: use.name,
      input: input as NonNullable<Json>,
      risk_level: risk === "high" ? ("high" as const) : ("low" as const),
      summary,
      tool_use_id: use.id,
      conversation_id: ctx.conversationId,
      message_id: messageId,
    };

    if (risk === "memory" || (risk === "low" && autoExecuteLowRisk)) {
      const outcome = await def.execute(input, ctx);
      const { data: logRow, error } = await ctx.supabase.from("ai_action_logs").insert({
        ...log,
        status: outcome.ok ? "executed" : "failed",
        result: outcome.ok ? (outcome.result as Json) : null,
        error: outcome.ok ? null : outcome.error,
        before_state: outcome.ok ? ((outcome.before ?? {}) as NonNullable<Json>) : undefined,
        entity_type: outcome.ok ? (outcome.entity?.type ?? null) : null,
        entity_id: outcome.ok && outcome.entity?.type !== "daily_review" ? (outcome.entity?.id ?? null) : null,
        executed_at: new Date().toISOString(),
      }).select("id").single();
      if (error) console.error("[companion] failed to log action", error);
      emit({ type: "tool", toolUseId: use.id, name: use.name, summary, status: outcome.ok ? "executed" : "failed", actionId: logRow?.id, error: outcome.ok ? undefined : outcome.error });
      return outcome.ok
        ? { type: "tool_result", tool_use_id: use.id, content: json({ status: "done", ...outcome.result }) }
        : { type: "tool_result", tool_use_id: use.id, is_error: true, content: `Failed: ${outcome.error}` };
    }

    // Needs the user's approval.
    const { data: logRow, error } = await ctx.supabase.from("ai_action_logs")
      .insert({ ...log, status: "proposed" }).select("id").single();
    if (error) {
      emit({ type: "tool", toolUseId: use.id, name: use.name, summary, status: "failed", error: "Couldn't queue the action" });
      return { type: "tool_result", tool_use_id: use.id, is_error: true, content: `Failed to queue the action for approval: ${error.message}` };
    }
    emit({ type: "tool", toolUseId: use.id, name: use.name, summary, status: "proposed", actionId: logRow.id });
    return {
      type: "tool_result",
      tool_use_id: use.id,
      content: json({
        status: "awaiting_user_approval",
        action_id: logRow.id,
        note: "NOT done yet. The user sees an approval card for this action. Tell them it's waiting for their approval; do not say it has been done.",
      }),
    };
  } catch (err) {
    console.error("[companion] tool failed", use.name, err);
    emit({ type: "tool", toolUseId: use.id, name: use.name, summary, status: "failed", error: "Unexpected error" });
    return { type: "tool_result", tool_use_id: use.id, is_error: true, content: "The tool failed unexpectedly." };
  }
}

/**
 * Approve and run a queued action. Claims it atomically (proposed → approved)
 * so a double click can't run it twice, then records the real outcome.
 */
export async function approveQueuedAction(supabase: Db, actionId: string, ctx: Omit<ToolContext, "conversationId">) {
  const claimed = await supabase.from("ai_action_logs")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", actionId).eq("status", "proposed")
    .select("id, tool_name, input, conversation_id").maybeSingle();
  if (claimed.error) return { ok: false as const, error: claimed.error.message };
  if (!claimed.data) return { ok: false as const, error: "This action was already approved or rejected." };

  const def = getTool(claimed.data.tool_name);
  const parsed = def?.schema.safeParse(claimed.data.input);
  let outcome: Awaited<ReturnType<NonNullable<typeof def>["execute"]>>;
  if (!def || !parsed?.success) {
    outcome = { ok: false, error: "The stored action is no longer valid." };
  } else {
    try {
      outcome = await def.execute(parsed.data, { ...ctx, conversationId: claimed.data.conversation_id });
    } catch (err) {
      console.error("[companion] approved action failed", err);
      outcome = { ok: false, error: "Unexpected error while running the action." };
    }
  }

  const { error } = await supabase.from("ai_action_logs").update({
    status: outcome.ok ? "executed" : "failed",
    result: outcome.ok ? (outcome.result as Json) : null,
    error: outcome.ok ? null : outcome.error,
    before_state: outcome.ok ? ((outcome.before ?? {}) as NonNullable<Json>) : undefined,
    entity_type: outcome.ok ? (outcome.entity?.type ?? null) : null,
    entity_id: outcome.ok && outcome.entity?.type !== "daily_review" ? (outcome.entity?.id ?? null) : null,
    executed_at: new Date().toISOString(),
  }).eq("id", actionId);
  if (error) console.error("[companion] failed to record outcome", error);

  return outcome.ok ? { ok: true as const } : { ok: false as const, error: outcome.error };
}

export async function rejectQueuedAction(supabase: Db, actionId: string) {
  const { data, error } = await supabase.from("ai_action_logs")
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", actionId).eq("status", "proposed").select("id").maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "This action was already approved or rejected." };
  return { ok: true as const };
}
