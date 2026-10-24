"use server";

import { refresh } from "next/cache";

import { dbFailed, formToObject, validationFailed, type ActionResult } from "@/lib/actions";
import { getToday } from "@/lib/server/preferences";
import { requireUser, type Db } from "@/lib/supabase/server";
import { idSchema } from "@/lib/validation/task";
import { dailyNotesSchema, dailyReviewSchema, timeBlockSchema } from "@/lib/validation/my-day";

/** Get (or create) the daily plan row for `date`. */
async function ensurePlan(supabase: Db, date: string) {
  const existing = await supabase.from("daily_plans").select("id").eq("plan_date", date).maybeSingle();
  if (existing.error) return { error: existing.error };
  if (existing.data) return { id: existing.data.id };

  const created = await supabase.from("daily_plans").insert({ plan_date: date }).select("id").single();
  if (created.error?.code === "23505") {
    // Created concurrently (e.g. two tabs) — use that one.
    const again = await supabase.from("daily_plans").select("id").eq("plan_date", date).single();
    return again.error ? { error: again.error } : { id: again.data.id };
  }
  return created.error ? { error: created.error } : { id: created.data.id };
}

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

/**
 * Saves the end-of-day review and records what happened to each planned task,
 * derived from the task's actual state (not guessed):
 * done → done, in progress → partial, due date moved later → moved, else skipped.
 */
export async function saveDailyReview(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = dailyReviewSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);
  const r = parsed.data;
  if (!r.wins && !r.challenges && !r.lessons && !r.tomorrow_focus && !r.energy && !r.mood) {
    return { ok: false, error: "Write at least one thing before saving the review." };
  }

  const { supabase } = await requireUser();
  const today = await getToday();
  const { error } = await supabase.from("daily_reviews").upsert(
    {
      review_date: today,
      wins: r.wins ?? null,
      challenges: r.challenges ?? null,
      lessons: r.lessons ?? null,
      tomorrow_focus: r.tomorrow_focus ?? null,
      energy: r.energy ?? null,
      mood: r.mood ?? null,
    },
    { onConflict: "user_id,review_date" },
  );
  if (error) return dbFailed(error);

  const plan = await supabase
    .from("daily_plans")
    .select("id, items:daily_plan_items(id, task:tasks(status, due_date))")
    .eq("plan_date", today)
    .maybeSingle();
  if (plan.error) return dbFailed(plan.error);

  for (const item of plan.data?.items ?? []) {
    if (!item.task) continue;
    const t = item.task;
    const outcome =
      t.status === "done"
        ? "done"
        : t.status === "in_progress"
          ? "partial"
          : t.due_date && t.due_date > today
            ? "moved"
            : "skipped";
    const res = await supabase.from("daily_plan_items").update({ outcome }).eq("id", item.id);
    if (res.error) return dbFailed(res.error);
  }

  refresh();
  return { ok: true, message: "Review saved. Well done for closing the day." };
}
