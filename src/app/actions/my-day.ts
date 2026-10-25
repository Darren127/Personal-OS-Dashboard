"use server";

import { refresh } from "next/cache";

import { dbFailed, formToObject, validationFailed, type ActionResult } from "@/lib/actions";
import { getToday } from "@/lib/server/preferences";
import { ensurePlan, saveReviewWithOutcomes } from "@/lib/server/plans";
import { requireUser } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation/task";
import { dailyNotesSchema, dailyReviewSchema, timeBlockSchema } from "@/lib/validation/my-day";

export async function addPriority(taskId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(taskId).success) return { ok: false, error: "Invalid task." };
  const { supabase } = await requireUser();
  const plan = await ensurePlan(supabase, await getToday());
  if (plan.error) return dbFailed(plan.error);

  const { data: items, error } = await supabase
    .from("daily_plan_items")
    .select("id, task_id, priority_rank")
    .eq("plan_id", plan.id);
  if (error) return dbFailed(error);

  const used = new Set(items.map((i) => i.priority_rank).filter(Boolean));
  const rank = [1, 2, 3].find((r) => !used.has(r));
  if (!rank) {
    return { ok: false, error: "You already have three priorities. Remove one first — three is the point." };
  }

  const existing = items.find((i) => i.task_id === taskId);
  const result = existing
    ? await supabase.from("daily_plan_items").update({ priority_rank: rank }).eq("id", existing.id)
    : await supabase.from("daily_plan_items").insert({ plan_id: plan.id, task_id: taskId, priority_rank: rank });
  if (result.error) return dbFailed(result.error);

  refresh();
  return { ok: true, message: `Added as priority #${rank}.` };
}

export async function removePriority(itemId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(itemId).success) return { ok: false, error: "Invalid item." };
  const { supabase } = await requireUser();
  const { data: item, error } = await supabase
    .from("daily_plan_items")
    .select("id, start_time")
    .eq("id", itemId)
    .maybeSingle();
  if (error) return dbFailed(error);
  if (!item) return { ok: false, error: "That priority no longer exists." };

  // Keep the item if it still has a time block; otherwise remove it from the plan.
  const result = item.start_time
    ? await supabase.from("daily_plan_items").update({ priority_rank: null }).eq("id", itemId)
    : await supabase.from("daily_plan_items").delete().eq("id", itemId);
  if (result.error) return dbFailed(result.error);

  refresh();
  return { ok: true, message: "Removed from today's priorities." };
}

export async function addTimeBlock(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = timeBlockSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);
  const { task_id, title, start_time, end_time } = parsed.data;

  const { supabase } = await requireUser();
  const plan = await ensurePlan(supabase, await getToday());
  if (plan.error) return dbFailed(plan.error);

  let result;
  if (task_id) {
    // A task appears in a plan once: give the existing entry a time if present.
    const existing = await supabase
      .from("daily_plan_items")
      .select("id")
      .eq("plan_id", plan.id)
      .eq("task_id", task_id)
      .maybeSingle();
    if (existing.error) return dbFailed(existing.error);
    result = existing.data
      ? await supabase.from("daily_plan_items").update({ start_time, end_time }).eq("id", existing.data.id)
      : await supabase.from("daily_plan_items").insert({ plan_id: plan.id, task_id, start_time, end_time });
  } else {
    result = await supabase
      .from("daily_plan_items")
      .insert({ plan_id: plan.id, title: title!, start_time, end_time });
  }
  if (result.error) return dbFailed(result.error);

  refresh();
  return { ok: true, message: "Time block added." };
}

export async function removeTimeBlock(itemId: string): Promise<ActionResult> {
  if (!idSchema.safeParse(itemId).success) return { ok: false, error: "Invalid item." };
  const { supabase } = await requireUser();
  const { data: item, error } = await supabase
    .from("daily_plan_items")
    .select("id, priority_rank")
    .eq("id", itemId)
    .maybeSingle();
  if (error) return dbFailed(error);
  if (!item) return { ok: false, error: "That time block no longer exists." };

  const result =
    item.priority_rank !== null
      ? await supabase.from("daily_plan_items").update({ start_time: null, end_time: null }).eq("id", itemId)
      : await supabase.from("daily_plan_items").delete().eq("id", itemId);
  if (result.error) return dbFailed(result.error);

  refresh();
  return { ok: true, message: "Time block removed." };
}

export async function saveDailyNotes(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = dailyNotesSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const plan = await ensurePlan(supabase, await getToday());
  if (plan.error) return dbFailed(plan.error);

  const { error } = await supabase
    .from("daily_plans")
    .update({ intention: parsed.data.intention ?? null, notes: parsed.data.notes ?? null })
    .eq("id", plan.id);
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Notes saved." };
}

/** Saves the end-of-day review and records each planned task's outcome. */
export async function saveDailyReview(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = dailyReviewSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);
  const r = parsed.data;
  if (!r.wins && !r.challenges && !r.lessons && !r.tomorrow_focus && !r.energy && !r.mood) {
    return { ok: false, error: "Write at least one thing before saving the review." };
  }

  const { supabase } = await requireUser();
  const { error } = await saveReviewWithOutcomes(supabase, await getToday(), r);
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Review saved. Well done for closing the day." };
}
