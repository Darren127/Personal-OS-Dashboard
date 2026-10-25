import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import type { CompanionPrefs } from "@/lib/server/ai/engine";
import type { Db } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/server";

type Block = Anthropic.Beta.Messages.BetaContentBlock;

export async function loadCompanionPrefs(supabase: Db): Promise<CompanionPrefs> {
  const { data } = await supabase.from("user_preferences").select("*").maybeSingle();
  return {
    timezone: data?.timezone ?? "UTC",
    workDayStart: data?.work_day_start ?? "09:00:00",
    workDayEnd: data?.work_day_end ?? "17:30:00",
    displayName: data?.display_name ?? null,
    aiAutoExecuteLowRisk: data?.ai_auto_execute_low_risk ?? false,
  };
}

export async function listConversations() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("conversations").select("id, title, updated_at")
    .order("updated_at", { ascending: false }).limit(50);
  if (error) throw new Error(`Failed to load conversations: ${error.message}`);
  return data;
}

export type ActionLog = {
  id: string;
  tool_name: string;
  summary: string | null;
  status: "proposed" | "approved" | "rejected" | "executed" | "failed";
  risk_level: "low" | "high";
  error: string | null;
  created_at: string;
  tool_use_id: string | null;
  message_id: string | null;
  conversation_id: string | null;
  before_state: unknown;
  result: unknown;
  entity_type: string | null;
  entity_id: string | null;
};

export type ChatItem =
  | { kind: "user"; id: string; text: string }
  | {
      kind: "assistant";
      id: string;
      text: string;
      notes: string[];
      tools: { id: string; name: string; action: ActionLog | null }[];
      declined: boolean;
    };

const ACTION_COLUMNS =
  "id, tool_name, summary, status, risk_level, error, created_at, tool_use_id, message_id, conversation_id, before_state, result, entity_type, entity_id";

/** The visible transcript of a conversation, with each tool call's logged action. */
export async function getConversation(id: string) {
  const { supabase } = await requireUser();
  const conv = await supabase.from("conversations").select("id, title").eq("id", id).maybeSingle();
  if (conv.error && conv.error.code !== "22P02") throw new Error(conv.error.message);
  if (!conv.data) return null;

  const [rows, logs] = await Promise.all([
    supabase.from("conversation_messages").select("id, role, content, text_content, stop_reason")
      .eq("conversation_id", id).eq("visible", true).order("seq"),
    supabase.from("ai_action_logs").select(ACTION_COLUMNS).eq("conversation_id", id),
  ]);
  if (rows.error) throw new Error(rows.error.message);
  if (logs.error) throw new Error(logs.error.message);
  // Match each logged action to the exact message and tool call that produced it.
  const byToolUse = new Map((logs.data as ActionLog[]).map((l) => [`${l.message_id}:${l.tool_use_id}`, l]));

  const items: ChatItem[] = rows.data.map((r) => {
    if (r.role === "user") return { kind: "user", id: r.id, text: r.text_content };
    const blocks = (Array.isArray(r.content) ? r.content : []) as unknown as Block[];
    return {
      kind: "assistant",
      id: r.id,
      text: r.text_content,
      notes: blocks.filter((b) => b.type === "thinking" && b.thinking).map((b) => (b as { thinking: string }).thinking),
      tools: blocks.filter((b) => b.type === "tool_use").map((b) => {
        const t = b as { id: string; name: string };
        return { id: t.id, name: t.name, action: byToolUse.get(`${r.id}:${t.id}`) ?? null };
      }),
      declined: r.stop_reason === "refusal",
    };
  });
  return { conversation: conv.data, items };
}

export async function listActions(filter: "pending" | "all") {
  const { supabase } = await requireUser();
  let q = supabase.from("ai_action_logs").select(`${ACTION_COLUMNS}, conversation:conversations(title)`)
    .order("created_at", { ascending: false }).limit(200);
  if (filter === "pending") q = q.eq("status", "proposed");
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load actions: ${error.message}`);
  return data as unknown as (ActionLog & { conversation: { title: string | null } | null })[];
}

export async function countPendingReview() {
  const { supabase } = await requireUser();
  const [actions, memories] = await Promise.all([
    supabase.from("ai_action_logs").select("id", { count: "exact", head: true }).eq("status", "proposed"),
    supabase.from("memories").select("id", { count: "exact", head: true }).eq("status", "proposed"),
  ]);
  return { actions: actions.count ?? 0, memories: memories.count ?? 0 };
}

export async function listMemories() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("memories")
    .select("id, category, content, confidence, status, importance, evidence_count, created_by, created_at, updated_at")
    .order("updated_at", { ascending: false }).limit(500);
  if (error) throw new Error(`Failed to load memories: ${error.message}`);
  return data;
}

export type Memory = Awaited<ReturnType<typeof listMemories>>[number];
