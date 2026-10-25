import "server-only";

import type { Db } from "@/lib/supabase/server";

type DbError = { code?: string; message: string };

/** Get (or create) the daily plan row for `date`. */
export async function ensurePlan(supabase: Db, date: string): Promise<{ id: string; error?: never } | { id?: never; error: DbError }> {
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

export type ReviewFields = {
  wins?: string;
  challenges?: string;
  lessons?: string;
  tomorrow_focus?: string;
  energy?: number;
  mood?: number;
};

/**
 * Save the end-of-day review for `date` and record what happened to each
 * planned task, derived from the task's actual state (not guessed):
 * done → done, in progress → partial, due date moved later → moved, else skipped.
 */
export async function saveReviewWithOutcomes(
  supabase: Db,
  date: string,
  r: ReviewFields,
): Promise<{ error?: DbError }> {
  const { error } = await supabase.from("daily_reviews").upsert(
    {
      review_date: date,
      wins: r.wins ?? null,
      challenges: r.challenges ?? null,
      lessons: r.lessons ?? null,
      tomorrow_focus: r.tomorrow_focus ?? null,
      energy: r.energy ?? null,
      mood: r.mood ?? null,
    },
    { onConflict: "user_id,review_date" },
  );
  if (error) return { error };

  const plan = await supabase
    .from("daily_plans")
    .select("id, items:daily_plan_items(id, task:tasks(status, due_date))")
    .eq("plan_date", date)
    .maybeSingle();
  if (plan.error) return { error: plan.error };

  for (const item of plan.data?.items ?? []) {
    if (!item.task) continue;
    const t = item.task;
    const outcome =
      t.status === "done"
        ? "done"
        : t.status === "in_progress"
          ? "partial"
          : t.due_date && t.due_date > date
            ? "moved"
            : "skipped";
    const res = await supabase.from("daily_plan_items").update({ outcome }).eq("id", item.id);
    if (res.error) return { error: res.error };
  }
  return {};
}
