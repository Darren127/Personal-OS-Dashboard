"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { dbFailed, formToObject, validationFailed, type ActionResult } from "@/lib/actions";
import { todayIn } from "@/lib/dates";
import { approveQueuedAction, rejectQueuedAction } from "@/lib/server/ai/engine";
import { loadCompanionPrefs } from "@/lib/server/companion";
import { requireUser } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation/task";

export async function approveAction(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid action." };
  const { supabase } = await requireUser();
  const prefs = await loadCompanionPrefs(supabase);
  const result = await approveQueuedAction(supabase, id, {
    supabase,
    today: todayIn(prefs.timezone),
    timezone: prefs.timezone,
    weekStartsOn: prefs.weekStartsOn,
  });
  refresh();
  return result.ok ? { ok: true, message: "Approved and done." } : { ok: false, error: result.error };
}

export async function rejectAction(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid action." };
  const { supabase } = await requireUser();
  const result = await rejectQueuedAction(supabase, id);
  refresh();
  return result.ok ? { ok: true, message: "Rejected. Nothing was changed." } : { ok: false, error: result.error };
}

export async function deleteConversation(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid conversation." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("conversations").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That conversation no longer exists." };
  redirect("/companion");
}

export async function setAutoExecute(enabled: boolean): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("user_preferences")
    .upsert({ ai_auto_execute_low_risk: enabled === true }, { onConflict: "user_id" });
  if (error) return dbFailed(error);
  refresh();
  return {
    ok: true,
    message: enabled ? "Low-risk actions will now run without asking." : "The AI will ask before every change.",
  };
}

// --- Memories --------------------------------------------------------------

const CATEGORIES = ["preference", "long_term_goal", "working_style", "recurring_obstacle", "decision", "lesson", "behavioural_observation"] as const;

const memorySchema = z.object({
  content: z.string().trim().min(1, "Write the memory.").max(2000),
  category: z.enum(CATEGORIES),
  confidence: z.enum(["confirmed", "hypothesis"]).default("confirmed"),
  importance: z.coerce.number().int().min(1).max(5).default(3),
});

export async function createMemory(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = memorySchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);
  const { supabase } = await requireUser();
  const { error } = await supabase.from("memories").insert({ ...parsed.data, status: "approved", created_by: "user" });
  if (error) return dbFailed(error);
  refresh();
  return { ok: true, message: "Memory saved." };
}

export async function updateMemory(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid memory." };
  const parsed = memorySchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("memories").update(parsed.data).eq("id", id).select("id").maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That memory no longer exists." };
  refresh();
  return { ok: true, message: "Memory updated." };
}

export async function setMemoryStatus(id: string, status: string): Promise<ActionResult> {
  const s = z.enum(["approved", "rejected", "archived"]).safeParse(status);
  if (!idSchema.safeParse(id).success || !s.success) return { ok: false, error: "Invalid request." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("memories").update({ status: s.data }).eq("id", id).select("id").maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That memory no longer exists." };
  refresh();
  return {
    ok: true,
    message: s.data === "approved" ? "Memory approved." : s.data === "rejected" ? "Memory rejected." : "Memory archived.",
  };
}

export async function deleteMemory(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid memory." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("memories").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That memory no longer exists." };
  refresh();
  return { ok: true, message: "Memory deleted." };
}
