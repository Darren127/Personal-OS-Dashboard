import "server-only";

import { addDays, zonedLocalToUtcIso } from "@/lib/dates";
import { OPEN_TASK_STATUSES } from "@/lib/domain";
import type { Db } from "@/lib/supabase/server";

/**
 * Deterministic behaviour statistics over a time window. These are facts
 * computed from the database, not AI judgements — the Companion uses them as
 * evidence, and they're the building blocks for future proactive checks.
 */
export async function getBehaviorInsights(supabase: Db, today: string, timezone: string, days: number) {
  return getPeriodStats(supabase, { from: addDays(today, -days), to: today, today }, timezone);
}

/**
 * The same statistics for an explicit period (inclusive dates), e.g. one
 * calendar week. Counts that describe "now" (open overdue tasks, repeatedly
 * rescheduled open tasks) are as of `today`.
 */
export async function getPeriodStats(
  supabase: Db,
  period: { from: string; to: string; today: string },
  timezone: string,
) {
  const { today } = period;
  const startDate = period.from;
  const endDate = period.to;
  const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000);
  const startIso = zonedLocalToUtcIso(`${startDate}T00:00`, timezone);
  const endIso = zonedLocalToUtcIso(`${addDays(endDate, 1)}T00:00`, timezone);

  const [created, completed, overdue, rescheduled, plans, reviews, goals, goalMilestones] = await Promise.all([
    supabase.from("tasks").select("id", { count: "exact", head: true }).gte("created_at", startIso).lt("created_at", endIso),
    supabase.from("tasks").select("id, title, goal_id, estimated_minutes, actual_minutes, completed_at")
      .gte("completed_at", startIso).lt("completed_at", endIso).limit(1000),
    supabase.from("tasks").select("id", { count: "exact", head: true })
      .lt("due_date", today).in("status", OPEN_TASK_STATUSES),
    supabase.from("tasks").select("id, title, reschedule_count, due_date, status")
      .gte("reschedule_count", 2).in("status", OPEN_TASK_STATUSES)
      .order("reschedule_count", { ascending: false }).limit(10),
    supabase.from("daily_plans").select("plan_date, items:daily_plan_items(priority_rank, outcome, task_id)")
      .gte("plan_date", startDate).lte("plan_date", endDate),
    supabase.from("daily_reviews").select("review_date, energy, mood, challenges")
      .gte("review_date", startDate).lte("review_date", endDate).order("review_date", { ascending: false }),
    supabase.from("goals").select("id, title, status, target_date").eq("status", "active"),
    supabase.from("goal_milestones").select("goal_id").gte("completed_at", startIso).lt("completed_at", endIso),
  ]);
  for (const r of [created, completed, overdue, rescheduled, plans, reviews, goals, goalMilestones]) {
    if (r.error) throw new Error(`Failed to compute insights: ${r.error.message}`);
  }

  // Planned-day outcomes (recorded when the end-of-day review is saved).
  const outcomeCounts: Record<string, number> = {};
  let prioritiesPlanned = 0;
  let prioritiesDone = 0;
  let daysWithPlan = 0;
  let daysReviewed = 0;
  for (const plan of plans.data!) {
    const taskItems = plan.items.filter((i) => i.task_id);
    if (taskItems.length) daysWithPlan++;
    if (taskItems.some((i) => i.outcome)) daysReviewed++;
    for (const i of taskItems) {
      if (i.outcome) outcomeCounts[i.outcome] = (outcomeCounts[i.outcome] ?? 0) + 1;
      if (i.priority_rank && i.outcome) {
        prioritiesPlanned++;
        if (i.outcome === "done") prioritiesDone++;
      }
    }
  }

  // Estimate accuracy on completed tasks that have both numbers.
  const timed = completed.data!.filter((t) => t.estimated_minutes && t.actual_minutes);
  const estimateRatio = timed.length
    ? Math.round((100 * timed.reduce((s, t) => s + t.actual_minutes! / t.estimated_minutes!, 0)) / timed.length) / 100
    : null;

  // Active goals with no completed tasks or milestones in the window.
  const activeGoalIds = new Set([
    ...completed.data!.map((t) => t.goal_id).filter(Boolean),
    ...goalMilestones.data!.map((m) => m.goal_id),
  ]);
  const stalledGoals = goals.data!.filter((g) => !activeGoalIds.has(g.id)).map((g) => ({ id: g.id, title: g.title }));
  const completedByGoal = goals.data!
    .map((g) => ({ goal: g.title, tasks_completed: completed.data!.filter((t) => t.goal_id === g.id).length }))
    .filter((g) => g.tasks_completed > 0);

  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10 : null;
  };

  return {
    window: { from: startDate, to: endDate, days },
    tasks: {
      created: created.count ?? 0,
      completed: completed.data!.length,
      completed_without_goal: completed.data!.filter((t) => !t.goal_id).length,
      open_overdue_now: overdue.count ?? 0,
    },
    repeatedly_rescheduled_open_tasks: rescheduled.data!.map((t) => ({
      id: t.id, title: t.title, times_pushed_later: t.reschedule_count, due_date: t.due_date, status: t.status,
    })),
    daily_plans: {
      days_with_a_plan: daysWithPlan,
      days_closed_with_review: daysReviewed,
      planned_task_outcomes: outcomeCounts,
      top_priorities_done: prioritiesPlanned ? `${prioritiesDone} of ${prioritiesPlanned}` : "no reviewed priorities",
    },
    estimates: estimateRatio === null
      ? { note: "No completed tasks with both an estimate and an actual time." }
      : { tasks_measured: timed.length, average_actual_to_estimate_ratio: estimateRatio },
    reviews: {
      count: reviews.data!.length,
      average_energy: avg(reviews.data!.map((r) => r.energy)),
      average_mood: avg(reviews.data!.map((r) => r.mood)),
      recent_challenges: reviews.data!
        .filter((r) => r.challenges)
        .slice(0, 5)
        .map((r) => ({ date: r.review_date, challenges: r.challenges!.slice(0, 300) })),
    },
    goals: {
      active: goals.data!.length,
      with_no_completed_tasks_or_milestones_in_window: stalledGoals,
      tasks_completed_per_goal: completedByGoal,
    },
  };
}

export type BehaviorInsights = Awaited<ReturnType<typeof getBehaviorInsights>>;
