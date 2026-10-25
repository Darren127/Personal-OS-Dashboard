/**
 * Integration tests for the AI Companion engine against the local Supabase
 * database, signed in as a real test user (Row Level Security applies).
 *
 * The Claude API is NOT called. A scripted stand-in model ("ScriptedModel")
 * returns pre-written responses so these tests can check what this app is
 * responsible for: the tool loop, permissions, approvals, the action log,
 * and that history is stored and replayed exactly. Real model behaviour must
 * be checked separately with a real API key.
 *
 * Requires: `npm run db:start` and a user created with
 *   NEW_USER_PASSWORD=... npm run create-user -- engine-test@personal-os.local
 * The suite is skipped if the local database isn't reachable.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AiConfig } from "@/lib/server/ai/config";
import { approveQueuedAction, rejectQueuedAction, runCompanionTurn, type ChatEvent, type CompanionPrefs } from "@/lib/server/ai/engine";
import type { ModelMessage, StreamParams, Streamer } from "@/lib/server/ai/model";
import { SYSTEM_PROMPT } from "@/lib/server/ai/prompt";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/server";

const EMAIL = "engine-test@personal-os.local";
const PASSWORD = "engine-test-password";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

const reachable = await (async () => {
  if (!URL || !KEY || !SECRET) return false;
  try {
    return (await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY } })).ok;
  } catch {
    return false;
  }
})();

type Block = ModelMessage["content"][number];
type Step = (params: StreamParams) => { content: unknown[]; stop_reason?: ModelMessage["stop_reason"] } | Error;

/** Scripted stand-in for Claude. Records every request it receives. */
function scriptedModel(steps: Step[]) {
  const requests: StreamParams[] = [];
  let i = 0;
  const streamer: Streamer = async (params, emit) => {
    requests.push(structuredClone(params));
    const step = steps[i++];
    if (!step) throw new Error("ScriptedModel: no more scripted responses");
    const r = step(params);
    if (r instanceof Error) throw r;
    for (const b of r.content as Block[]) if (b.type === "text") emit({ type: "text", delta: b.text });
    const hasTool = (r.content as Block[]).some((b) => b.type === "tool_use");
    return {
      id: `msg_test_${i}`,
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: r.content as Block[],
      stop_reason: r.stop_reason ?? (hasTool ? "tool_use" : "end_turn"),
      stop_sequence: null,
      usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    } as unknown as ModelMessage;
  };
  return { streamer, requests };
}

const text = (t: string) => ({ type: "text", text: t, citations: null });
const thinking = (sig: string) => ({ type: "thinking", thinking: "", signature: sig });
const toolUse = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input });

const config: AiConfig = { configured: true, apiKey: "test", model: "claude-opus-5-5", effort: "medium", monthlyBudgetUsd: null };
const prefs: CompanionPrefs = { timezone: "Asia/Singapore", workDayStart: "09:00:00", workDayEnd: "17:30:00", displayName: "Tester", aiAutoExecuteLowRisk: false };

let supabase: SupabaseClient<Database>;
let admin: SupabaseClient<Database>;
let userId: string;
let db: Db;

async function run(opts: { conversationId?: string | null; text: string; model: ReturnType<typeof scriptedModel>; prefs?: Partial<CompanionPrefs>; config?: Partial<AiConfig> }) {
  const events: ChatEvent[] = [];
  await runCompanionTurn({
    supabase: db,
    config: { ...config, ...opts.config },
    streamer: opts.model.streamer,
    prefs: { ...prefs, ...opts.prefs },
    conversationId: opts.conversationId ?? null,
    userText: opts.text,
    emit: (e) => events.push(e),
  });
  const conv = events.find((e) => e.type === "conversation") as Extract<ChatEvent, { type: "conversation" }> | undefined;
  return { events, conversationId: conv?.id ?? opts.conversationId ?? null };
}

describe.skipIf(!reachable)("Companion engine (scripted model, real database)", () => {
  beforeAll(async () => {
    admin = createClient<Database>(URL!, SECRET!, { auth: { persistSession: false } });
    const existing = await admin.auth.admin.listUsers();
    if (!existing.data.users.some((u) => u.email === EMAIL)) {
      const { error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
      if (error) throw error;
    }
    supabase = createClient<Database>(URL!, KEY!, { auth: { persistSession: false } });
    const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (error) throw error;
    userId = data.user.id;
    db = supabase as unknown as Db;
  });

  beforeEach(async () => {
    // Fresh slate for this test user only (RLS scopes every delete to them).
    // The action log is append-only for users, so clean it with the admin key.
    await admin.from("ai_action_logs").delete().eq("user_id", userId);
    await supabase.from("conversations").delete().not("id", "is", null);
    await supabase.from("tasks").delete().not("id", "is", null);
    await supabase.from("memories").delete().not("id", "is", null);
  });

  afterAll(async () => {
    if (admin && userId) await admin.from("ai_action_logs").delete().eq("user_id", userId);
    await supabase?.from("conversations").delete().not("id", "is", null);
    await supabase?.from("tasks").delete().not("id", "is", null);
    await supabase?.from("memories").delete().not("id", "is", null);
  });

  it("queues write actions for approval and tells the model truthfully", async () => {
    const model = scriptedModel([
      () => ({ content: [thinking("sig1"), toolUse("toolu_a", "search_tasks", { due: "overdue" }), toolUse("toolu_b", "create_task", { title: "Call the bank", priority: "high" })] }),
      () => ({ content: [thinking("sig2"), text("I've queued the task for your approval.")] }),
    ]);
    const { events, conversationId } = await run({ text: "Add a task to call the bank", model });

    expect(conversationId).toBeTruthy();
    // Request shape: frozen system prompt, adaptive thinking with drop_block, fallbacks, betas.
    const req = model.requests[0];
    expect(req.system).toBe(SYSTEM_PROMPT);
    expect(req.thinking).toMatchObject({ type: "adaptive", display: "updates", block_binding: { prefix_mismatch_behavior: "drop_block" } });
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toContain("server-side-fallback-2026-07-01");
    expect(req.output_config).toEqual({ effort: "medium" });
    expect(req.tools!.every((t) => "eager_input_streaming" in t)).toBe(true);
    // The context note is an appended system message after the user message.
    expect(req.messages.at(-1)!.role).toBe("system");
    expect(JSON.stringify(req.messages.at(-1)!.content)).toContain("## Due today");

    // The task was NOT created; an approval card was logged.
    expect((await supabase.from("tasks").select("id")).data).toHaveLength(0);
    const logs = (await supabase.from("ai_action_logs").select("*").eq("conversation_id", conversationId!)).data!;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ tool_name: "create_task", status: "proposed", summary: 'Create task "Call the bank"', tool_use_id: "toolu_b" });

    // The model was told it is NOT done.
    const results = model.requests[1].messages.at(-1)!.content as { tool_use_id: string; content: string; is_error?: boolean }[];
    expect(results.map((r) => r.tool_use_id)).toEqual(["toolu_a", "toolu_b"]);
    expect(JSON.parse(results[1].content)).toMatchObject({ status: "awaiting_user_approval", action_id: logs[0].id });
    expect(events.filter((e) => e.type === "tool").map((e) => (e as { status: string }).status)).toEqual(["done", "proposed"]);

    // History stored in exact order with the right visibility.
    const rows = (await supabase.from("conversation_messages").select("role, visible").eq("conversation_id", conversationId!).order("seq")).data!;
    expect(rows).toEqual([
      { role: "user", visible: true },
      { role: "system", visible: false },
      { role: "assistant", visible: true },
      { role: "user", visible: false },
      { role: "assistant", visible: true },
    ]);
  });

  it("approving runs the action once and the next turn learns the outcome", async () => {
    const model = scriptedModel([
      () => ({ content: [toolUse("toolu_c", "create_task", { title: "Book flights", due_date: "2026-11-30" })] }),
      () => ({ content: [text("Queued.")] }),
    ]);
    const { conversationId } = await run({ text: "Remind me to book flights", model });
    const log = (await supabase.from("ai_action_logs").select("id").eq("status", "proposed").single()).data!;

    const ctx = { supabase: db, today: "2026-10-25", timezone: prefs.timezone };
    expect(await approveQueuedAction(db, log.id, ctx)).toEqual({ ok: true });
    expect(await approveQueuedAction(db, log.id, ctx)).toMatchObject({ ok: false }); // no double-run
    const tasks = (await supabase.from("tasks").select("id, title, due_date")).data!;
    expect(tasks).toEqual([{ id: expect.any(String), title: "Book flights", due_date: "2026-11-30" }]);
    const after = (await supabase.from("ai_action_logs").select("status, entity_id").eq("id", log.id).single()).data!;
    expect(after).toEqual({ status: "executed", entity_id: tasks[0].id });

    // Second turn: history replayed byte-for-byte, and the context reports the approval.
    const turn1 = JSON.stringify(model.requests[1].messages.concat([{ role: "assistant", content: [text("Queued.")] } as never]));
    const model2 = scriptedModel([() => ({ content: [text("Done — it's on your list.")] })]);
    await run({ conversationId, text: "Thanks", model: model2 });
    const sent = model2.requests[0].messages;
    expect(JSON.stringify(sent.slice(0, sent.length - 2))).toBe(turn1);
    expect(JSON.stringify(sent.at(-1)!.content)).toContain("approved by the user and completed");
  });

  it("rejecting records the decision and runs nothing", async () => {
    const model = scriptedModel([
      () => ({ content: [toolUse("toolu_r", "create_task", { title: "Unwanted" })] }),
      () => ({ content: [text("Queued.")] }),
    ]);
    await run({ text: "x", model });
    const log = (await supabase.from("ai_action_logs").select("id").eq("status", "proposed").single()).data!;
    expect(await rejectQueuedAction(db, log.id)).toEqual({ ok: true });
    expect(await approveQueuedAction(db, log.id, { supabase: db, today: "2026-10-25", timezone: "UTC" })).toMatchObject({ ok: false });
    expect((await supabase.from("tasks").select("id")).data).toHaveLength(0);
  });

  it("auto-executes low-risk actions only when enabled, never high-risk ones", async () => {
    const task = (await supabase.from("tasks").insert({ title: "Old idea", status: "next" }).select("id").single()).data!;
    const model = scriptedModel([
      () => ({ content: [toolUse("t1", "update_task_status", { task_id: task.id, status: "cancelled" }), toolUse("t2", "delete_task", { task_id: task.id, reason: "duplicate" })] }),
      () => ({ content: [text("ok")] }),
    ]);
    await run({ text: "Drop the old idea", model, prefs: { aiAutoExecuteLowRisk: true } });

    const t = (await supabase.from("tasks").select("status").eq("id", task.id).single()).data!;
    expect(t.status).toBe("cancelled"); // low-risk ran
    const logs = (await supabase.from("ai_action_logs").select("tool_name, status, before_state").order("created_at")).data!;
    expect(logs.find((l) => l.tool_name === "update_task_status")).toMatchObject({ status: "executed", before_state: { status: "next" } });
    expect(logs.find((l) => l.tool_name === "delete_task")).toMatchObject({ status: "proposed" }); // high-risk queued
    const results = model.requests[1].messages.at(-1)!.content as { content: string }[];
    expect(JSON.parse(results[0].content)).toMatchObject({ status: "done" });
    expect(JSON.parse(results[1].content)).toMatchObject({ status: "awaiting_user_approval" });
  });

  it("rejects invalid tool input without running anything", async () => {
    const model = scriptedModel([
      () => ({ content: [toolUse("bad", "create_task", { title: "", priority: "urgent!!" })] }),
      () => ({ content: [text("Sorry.")] }),
    ]);
    await run({ text: "x", model, prefs: { aiAutoExecuteLowRisk: true } });
    const result = (model.requests[1].messages.at(-1)!.content as { is_error: boolean; content: string }[])[0];
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("INVALID_INPUT");
    expect((await supabase.from("tasks").select("id")).data).toHaveLength(0);
    expect((await supabase.from("ai_action_logs").select("id")).data).toHaveLength(0);
  });

  it("memories proposed by the AI wait for review", async () => {
    const model = scriptedModel([
      () => ({ content: [toolUse("m1", "propose_memory", { category: "working_style", content: "Prefers deep work before noon", confidence: "confirmed", evidence: "Said so directly" })] }),
      () => ({ content: [text("I've proposed that as a memory for you to review.")] }),
    ]);
    const { conversationId } = await run({ text: "I do my best work before noon", model });
    const mem = (await supabase.from("memories").select("status, created_by, confidence, source_conversation_id")).data!;
    expect(mem).toEqual([{ status: "proposed", created_by: "ai", confidence: "confirmed", source_conversation_id: conversationId }]);
  });

  it("never runs tools from a declined response, but keeps the history valid", async () => {
    const model = scriptedModel([
      () => ({ content: [toolUse("x1", "create_task", { title: "Something" })], stop_reason: "refusal" }),
    ]);
    const { events, conversationId } = await run({ text: "x", model, prefs: { aiAutoExecuteLowRisk: true } });
    expect((await supabase.from("tasks").select("id")).data).toHaveLength(0);
    expect(events.some((e) => e.type === "notice" && e.level === "warning")).toBe(true);
    // The unanswered tool call still got a stored (error) result.
    const last = (await supabase.from("conversation_messages").select("role, content").eq("conversation_id", conversationId!).order("seq")).data!.at(-1)!;
    expect(last.role).toBe("user");
    expect(JSON.stringify(last.content)).toContain("Not run");
  });

  it("every read tool runs against the real schema without errors", async () => {
    const goal = (await supabase.from("goals").insert({ title: "Run a 10k" }).select("id").single()).data!;
    const project = (await supabase.from("projects").insert({ name: "Training plan", status: "active" }).select("id").single()).data!;
    await supabase.from("tasks").insert({ title: "Buy running shoes", goal_id: goal.id, project_id: project.id, due_date: "2026-10-01" });
    const model = scriptedModel([
      () => ({
        content: [
          toolUse("r1", "search_tasks", { status: "all", query: "shoes" }),
          toolUse("r2", "get_goal_details", { goal_id: goal.id }),
          toolUse("r3", "get_project_details", { project_id: project.id }),
          toolUse("r4", "get_reviews", { days: 30 }),
          toolUse("r5", "get_behavior_insights", { days: 30 }),
          toolUse("r6", "search_memories", { query: "morning focus" }),
          toolUse("r7", "search_past_conversations", { query: "running shoes" }),
        ],
      }),
      () => ({ content: [text("Here's what I found.")] }),
    ]);
    await run({ text: "How is my running going?", model });
    const results = model.requests[1].messages.at(-1)!.content as { tool_use_id: string; is_error?: boolean; content: string }[];
    expect(results.filter((r) => r.is_error)).toEqual([]);
    const byId = Object.fromEntries(results.map((r) => [r.tool_use_id, JSON.parse(r.content)]));
    expect(byId.r1.tasks[0]).toMatchObject({ title: "Buy running shoes", project: { name: "Training plan" }, goal: { title: "Run a 10k" } });
    expect(byId.r2.progress).toMatchObject({ source: "tasks", value: 0 });
    expect(byId.r3.rule_based_next_action.title).toBe("Buy running shoes"); // overdue
    expect(byId.r5.tasks.open_overdue_now).toBe(1);
    await supabase.from("projects").delete().eq("id", project.id);
    await supabase.from("goals").delete().eq("id", goal.id);
  });

  it("stores nothing when the first request fails", async () => {
    const model = scriptedModel([() => new Error("network down")]);
    const { events, conversationId } = await run({ text: "Hello?", model });
    expect(conversationId).toBeNull();
    expect((await supabase.from("conversations").select("id")).data).toHaveLength(0);
    expect(events.some((e) => e.type === "notice" && e.level === "error")).toBe(true);
  });

  it("refuses to call the model once the monthly budget is used up", async () => {
    const model = scriptedModel([() => ({ content: [text("hi")] })]);
    await run({ text: "first", model });
    const blocked = scriptedModel([() => ({ content: [text("should not run")] })]);
    const { events } = await run({ text: "second", model: blocked, config: { monthlyBudgetUsd: 0.001 } });
    expect(blocked.requests).toHaveLength(0);
    expect(events.find((e) => e.type === "notice")).toMatchObject({ level: "error" });
  });
});
