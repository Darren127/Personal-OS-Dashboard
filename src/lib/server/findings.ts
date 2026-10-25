import "server-only";

import { addDays, timeToMinutes, zonedLocalToUtcIso } from "@/lib/dates";
import { OPEN_TASK_STATUSES } from "@/lib/domain";
import { detectFindings, type DetectorInput } from "@/lib/findings";
import type { Db } from "@/lib/supabase/server";

type Prefs = { timezone: string; workDayStart: string; workDayEnd: string };

/** Gather everything the pattern detectors look at. */
export async function fetchDetectorInput(supabase: Db, today: string, prefs: Prefs): Promise<DetectorInput> {
  const twoWeeksAgo = addDays(today, -14);
  const since = zonedLocalToUtcIso(`${twoWeeksAgo}T00:00`, prefs.timezone);

  const [open, todayPlan, plans, reviews, goals, doneForGoals, milestonesDone, blockers] = await Promise.all([
    supabase.from("tasks").select("id, title, status, priority, due_date, estimated_minutes, reschedule_count")
      .in("status", OPEN_TASK_STATUSES).limit(1000),
    supabase.from("daily_plans").select("items:daily_plan_items(task_id, priority_rank, start_time, end_time)")
      .eq("plan_date", today).maybeSingle(),
    supabase.from("daily_plans").select("plan_date, items:daily_plan_items(task_id, priority_rank, outcome)")
      .gte("plan_date", twoWeeksAgo).lt("plan_date", today),
    supabase.from("daily_reviews").select("review_date").gte("review_date", addDays(today, -7)).lt("review_date", today),
    supabase.from("goals").select("id, title, created_at").eq("status", "active"),
    supabase.from("tasks").select("goal_id").not("goal_id", "is", null).gte("completed_at", since),
    supabase.from("goal_milestones").select("goal_id").gte("completed_at", since),
    supabase.from("project_blockers").select("description, created_at, project:projects(id, name, status)").is("resolved_at", null),
  ]);
  for (const r of [open, todayPlan, plans, reviews, goals, doneForGoals, milestonesDone, blockers]) {
    if (r.error) throw new Error(`Failed to check patterns: ${r.error.message}`);
  }

  const items = todayPlan.data?.items ?? [];
  const fixedBlockMinutes = items
    .filter((i) => !i.task_id && i.start_time && i.end_time)
    .reduce((s, i) => s + timeToMinutes(i.end_time!) - timeToMinutes(i.start_time!), 0);
  const openIds = new Set(open.data!.map((t) => t.id));
  const todayTaskIds = [
    ...new Set([
      ...open.data!.filter((t) => t.due_date === today).map((t) => t.id),
      ...items.map((i) => i.task_id).filter((id): id is string => Boolean(id && openIds.has(id))),
    ]),
  ];
  const activeGoalIds = new Set([
    ...doneForGoals.data!.map((t) => t.goal_id),
    ...milestonesDone.data!.map((m) => m.goal_id),
  ]);

  return {
    today,
    availableMinutes: Math.max(0, timeToMinutes(prefs.workDayEnd) - timeToMinutes(prefs.workDayStart) - fixedBlockMinutes),
    openTasks: open.data!,
    todayTaskIds,
    todayPriorityIds: items.filter((i) => i.priority_rank && i.task_id).map((i) => i.task_id!),
    recentPlans: plans.data!,
    recentReviewDates: reviews.data!.map((r) => r.review_date),
    goals: goals.data!.map((g) => ({ ...g, recentlyActive: activeGoalIds.has(g.id) })),
    blockers: blockers.data!
      .filter((b) => b.project && (b.project.status === "active" || b.project.status === "planning"))
      .map((b) => ({ projectId: b.project!.id, projectName: b.project!.name, description: b.description, created_at: b.created_at })),
  };
}

/** Current findings, minus any the user dismissed or snoozed. */
export async function getFindings(supabase: Db, today: string, prefs: Prefs) {
  const [input, dismissed] = await Promise.all([
    fetchDetectorInput(supabase, today, prefs),
    supabase.from("finding_dismissals").select("finding_key").gte("dismissed_until", today),
  ]);
  if (dismissed.error) throw new Error(`Failed to load dismissals: ${dismissed.error.message}`);
  const hidden = new Set(dismissed.data.map((d) => d.finding_key));
  const all = detectFindings(input);
  return { findings: all.filter((f) => !hidden.has(f.key)), hiddenCount: all.filter((f) => hidden.has(f.key)).length };
}
