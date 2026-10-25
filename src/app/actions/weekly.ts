"use server";

import { refresh } from "next/cache";

import { dbFailed, formToObject, validationFailed, type ActionResult } from "@/lib/actions";
import { weekStartOf } from "@/lib/dates";
import { getPreferences, getToday } from "@/lib/server/preferences";
import { upsertWeeklyReview } from "@/lib/server/weekly";
import { requireUser } from "@/lib/supabase/server";
import { weeklyReviewSchema } from "@/lib/validation/weekly";

export async function saveWeeklyReview(weekStart: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const prefs = await getPreferences();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || weekStartOf(weekStart, prefs.weekStartsOn) !== weekStart) {
    return { ok: false, error: "Invalid week." };
  }
  const today = await getToday();
  if (weekStart > today) return { ok: false, error: "That week hasn't started yet." };

  const parsed = weeklyReviewSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);
  const r = parsed.data;
  if (!r.wins && !r.challenges && !r.lessons && !r.next_week_focus && !r.rating) {
    return { ok: false, error: "Write at least one thing before saving." };
  }

  const { supabase } = await requireUser();
  const { error } = await upsertWeeklyReview(supabase, weekStart, today, prefs.timezone, {
    wins: r.wins ?? null,
    challenges: r.challenges ?? null,
    lessons: r.lessons ?? null,
    next_week_focus: r.next_week_focus ?? null,
    rating: r.rating ?? null,
  });
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Weekly review saved." };
}
