"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { dbFailed, type ActionResult } from "@/lib/actions";
import { addDays } from "@/lib/dates";
import { getToday } from "@/lib/server/preferences";
import { requireUser } from "@/lib/supabase/server";

const dismissSchema = z.object({
  key: z.string().min(1).max(200),
  period: z.enum(["day", "week", "forever"]),
});

/** Hide a finding until tomorrow, for a week, or for good (until the situation changes). */
export async function dismissFinding(key: string, period: string): Promise<ActionResult> {
  const parsed = dismissSchema.safeParse({ key, period });
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { supabase } = await requireUser();
  const today = await getToday();
  const until = parsed.data.period === "day" ? today : parsed.data.period === "week" ? addDays(today, 6) : "9999-12-31";
  const { error } = await supabase.from("finding_dismissals")
    .upsert({ finding_key: parsed.data.key, dismissed_until: until }, { onConflict: "user_id,finding_key" });
  if (error) return dbFailed(error);
  refresh();
  return {
    ok: true,
    message: parsed.data.period === "day" ? "Hidden until tomorrow." : parsed.data.period === "week" ? "Hidden for a week." : "Dismissed.",
  };
}

const rescheduleSchema = z.object({
  taskIds: z.array(z.uuid()).min(1).max(30),
  dueDate: z.iso.date(),
});

/** Apply a suggested adjustment: move these tasks to a new due date. */
export async function rescheduleTasks(taskIds: string[], dueDate: string): Promise<ActionResult> {
  const parsed = rescheduleSchema.safeParse({ taskIds, dueDate });
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { supabase } = await requireUser();
  const today = await getToday();
  if (parsed.data.dueDate < today) return { ok: false, error: "Can't move tasks into the past." };

  const { data, error } = await supabase.from("tasks")
    .update({ due_date: parsed.data.dueDate })
    .in("id", parsed.data.taskIds)
    .select("id");
  if (error) return dbFailed(error);

  // They're no longer part of today's plan.
  const plan = await supabase.from("daily_plans").select("id").eq("plan_date", today).maybeSingle();
  if (plan.data && parsed.data.dueDate > today) {
    await supabase.from("daily_plan_items").delete().eq("plan_id", plan.data.id).in("task_id", parsed.data.taskIds).is("priority_rank", null);
  }

  refresh();
  return { ok: true, message: `Moved ${data.length} ${data.length === 1 ? "task" : "tasks"}.` };
}
