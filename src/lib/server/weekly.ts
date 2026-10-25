import "server-only";

import { addDays, weekStartOf } from "@/lib/dates";
import { getPeriodStats } from "@/lib/server/insights";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/server";

type WeeklyRow = Database["public"]["Tables"]["weekly_reviews"]["Row"];

/** Statistics for one calendar week (as of today). */
export function weekStats(supabase: Db, weekStart: string, today: string, timezone: string) {
  return getPeriodStats(supabase, { from: weekStart, to: addDays(weekStart, 6), today }, timezone);
}

export type WeekStats = Awaited<ReturnType<typeof weekStats>>;

export async function getWeek(supabase: Db, weekStart: string, today: string, timezone: string) {
  const [stats, daily, saved, history] = await Promise.all([
    weekStats(supabase, weekStart, today, timezone),
    supabase.from("daily_reviews").select("review_date, wins, challenges, lessons, energy, mood")
      .gte("review_date", weekStart).lte("review_date", addDays(weekStart, 6)).order("review_date"),
    supabase.from("weekly_reviews").select("*").eq("week_start", weekStart).maybeSingle(),
    supabase.from("weekly_reviews").select("week_start, rating, next_week_focus, ai_summary")
      .order("week_start", { ascending: false }).limit(26),
  ]);
  for (const r of [daily, saved, history]) {
    if (r.error) throw new Error(`Failed to load the week: ${r.error.message}`);
  }
  return { stats, daily: daily.data!, saved: saved.data as WeeklyRow | null, history: history.data! };
}

/**
 * Create or update a week's review. Only the fields given are changed, and the
 * statistics snapshot is refreshed so the record shows the numbers as they
 * were when the review was written.
 */
export async function upsertWeeklyReview(
  supabase: Db,
  weekStart: string,
  today: string,
  timezone: string,
  fields: Partial<Pick<WeeklyRow, "wins" | "challenges" | "lessons" | "next_week_focus" | "rating" | "ai_summary">>,
) {
  const stats = await weekStats(supabase, weekStart, today, timezone);
  return supabase.from("weekly_reviews")
    .upsert({ week_start: weekStart, ...fields, stats: stats as unknown as Json }, { onConflict: "user_id,week_start" })
    .select("id")
    .single();
}

/** Parse ?week= into a valid week start, defaulting to the current week. */
export function resolveWeek(raw: unknown, today: string, weekStartsOn: number) {
  const valid = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw));
  return weekStartOf(valid ? (raw as string) : today, weekStartsOn);
}
