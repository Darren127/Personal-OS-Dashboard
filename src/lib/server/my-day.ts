import "server-only";

import { addDays, timeToMinutes, zonedLocalToUtcIso } from "@/lib/dates";
import { OPEN_TASK_STATUSES } from "@/lib/domain";
import { getPreferences } from "@/lib/server/preferences";
import { TASK_SELECT, type TaskWithLinks } from "@/lib/server/tasks";
import { requireUser } from "@/lib/supabase/server";

export type Deadline = {
  kind: "task" | "project_milestone" | "goal_milestone" | "project";
  id: string;
  title: string;
  date: string;
  href: string;
  context?: string;
};

export async function getMyDay(today: string) {
  const { supabase } = await requireUser();
  const prefs = await getPreferences();
  const dayStart = zonedLocalToUtcIso(`${today}T00:00`, prefs.timezone);
  const dayEnd = zonedLocalToUtcIso(`${addDays(today, 1)}T00:00`, prefs.timezone);
  const horizon = addDays(today, 14);

  const [plan, dueToday, overdue, completedToday, upcoming, pMilestones, gMilestones, projects, review, openTasks] =
    await Promise.all([
      supabase
        .from("daily_plans")
        .select(`*, items:daily_plan_items(*, task:tasks(${TASK_SELECT}))`)
        .eq("plan_date", today)
        .maybeSingle(),
      supabase.from("tasks").select(TASK_SELECT).eq("due_date", today).neq("status", "cancelled")
        .order("status").order("priority", { ascending: false }),
      supabase.from("tasks").select(TASK_SELECT).lt("due_date", today).in("status", OPEN_TASK_STATUSES)
        .order("due_date").order("priority", { ascending: false }),
      supabase.from("tasks").select(TASK_SELECT).gte("completed_at", dayStart).lt("completed_at", dayEnd),
      supabase.from("tasks").select("id, title, due_date, project:projects(name)")
        .gt("due_date", today).lte("due_date", horizon).in("status", OPEN_TASK_STATUSES)
        .order("due_date").limit(20),
      supabase.from("project_milestones").select("id, title, due_date, project_id, project:projects(name)")
        .gte("due_date", today).lte("due_date", horizon).is("completed_at", null).order("due_date"),
      supabase.from("goal_milestones").select("id, title, due_date, goal_id, goal:goals(title)")
        .gte("due_date", today).lte("due_date", horizon).is("completed_at", null).order("due_date"),
      supabase.from("projects").select("id, name, target_date")
        .gte("target_date", today).lte("target_date", horizon).in("status", ["planning", "active"]),
      supabase.from("daily_reviews").select("*").eq("review_date", today).maybeSingle(),
      // Candidates for "add to top 3" / time blocks.
      supabase.from("tasks").select("id, title, due_date, priority").in("status", OPEN_TASK_STATUSES)
        .order("due_date", { ascending: true, nullsFirst: false }).order("priority", { ascending: false }).limit(200),
    ]);

  for (const r of [plan, dueToday, overdue, completedToday, upcoming, pMilestones, gMilestones, projects, review, openTasks]) {
    if (r.error) throw new Error(`Failed to load My Day: ${r.error.message}`);
  }

  const items = plan.data?.items ?? [];
  const priorities = items
    .filter((i) => i.priority_rank !== null && i.task)
    .sort((a, b) => a.priority_rank! - b.priority_rank!)
    .map((i) => ({ itemId: i.id, rank: i.priority_rank!, task: i.task as TaskWithLinks }));

  const blocks = items
    .filter((i) => i.start_time && i.end_time)
    .sort((a, b) => a.start_time!.localeCompare(b.start_time!))
    .map((i) => ({
      itemId: i.id,
      start: i.start_time!,
      end: i.end_time!,
      title: i.task?.title ?? i.title ?? "Untitled",
      task: (i.task as TaskWithLinks | null) ?? null,
    }));

  // "Today's tasks" = due today ∪ planned today ∪ completed today (no duplicates).
  const todays = new Map<string, TaskWithLinks>();
  for (const t of dueToday.data ?? []) todays.set(t.id, t);
  for (const i of items) if (i.task) todays.set(i.task.id, i.task as TaskWithLinks);
  for (const t of completedToday.data ?? []) todays.set(t.id, t);
  const counted = [...todays.values()].filter((t) => t.status !== "cancelled");
  const doneCount = counted.filter((t) => t.status === "done").length;

  // Capacity: remaining estimated work vs. the length of the working day.
  const openToday = counted.filter((t) => t.status !== "done");
  const estimatedMinutes = openToday.reduce((sum, t) => sum + (t.estimated_minutes ?? 0), 0);
  const unestimated = openToday.filter((t) => !t.estimated_minutes).length;
  const workdayMinutes = timeToMinutes(prefs.workDayEnd) - timeToMinutes(prefs.workDayStart);
  const blockedMinutes = blocks
    .filter((b) => !b.task)
    .reduce((s, b) => s + timeToMinutes(b.end) - timeToMinutes(b.start), 0);

  const deadlines: Deadline[] = [
    ...(upcoming.data ?? []).map((t) => ({
      kind: "task" as const, id: t.id, title: t.title, date: t.due_date!, href: "/tasks?due=week", context: t.project?.name,
    })),
    ...(pMilestones.data ?? []).map((m) => ({
      kind: "project_milestone" as const, id: m.id, title: m.title, date: m.due_date!, href: `/projects/${m.project_id}`, context: m.project?.name,
    })),
    ...(gMilestones.data ?? []).map((m) => ({
      kind: "goal_milestone" as const, id: m.id, title: m.title, date: m.due_date!, href: `/goals/${m.goal_id}`, context: m.goal?.title,
    })),
    ...(projects.data ?? []).map((p) => ({
      kind: "project" as const, id: p.id, title: `${p.name} deadline`, date: p.target_date!, href: `/projects/${p.id}`,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const prioritizedIds = new Set(priorities.map((p) => p.task.id));

  return {
    plan: plan.data ? { id: plan.data.id, notes: plan.data.notes ?? "", intention: plan.data.intention ?? "" } : null,
    priorities,
    blocks,
    dueToday: (dueToday.data ?? []).sort((a, b) => Number(a.status === "done") - Number(b.status === "done")),
    overdue: overdue.data ?? [],
    deadlines,
    review: review.data,
    progress: { done: doneCount, total: counted.length },
    capacity: { estimatedMinutes, unestimated, workdayMinutes, blockedMinutes },
    candidates: (openTasks.data ?? []).filter((t) => !prioritizedIds.has(t.id)),
    allOpen: openTasks.data ?? [],
  };
}

export type MyDay = Awaited<ReturnType<typeof getMyDay>>;
