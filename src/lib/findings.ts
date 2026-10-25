/**
 * Pattern detection ("worth a look"). Pure functions over data the server
 * fetches: no database access and no AI here, so every rule is exact,
 * free to run, and easy to test. Each finding carries its evidence.
 */
import { addDays, daysBetween, formatMinutes } from "@/lib/dates";
import { PRIORITY_RANK, type Priority, type TaskStatus } from "@/lib/domain";

export type FindingSeverity = "alert" | "warning" | "info";

export type FindingAction =
  | { kind: "reschedule_tasks"; label: string; taskIds: string[]; dueDate: string }
  | { kind: "cancel_task"; label: string; taskId: string }
  | { kind: "link"; label: string; href: string }
  | { kind: "ask_ai"; label: string; prompt: string };

export type Finding = {
  /** Stable while the situation is unchanged; changes when it gets worse. */
  key: string;
  type: "overload" | "overdue" | "repeated_reschedule" | "failed_priority" | "priority_rate" | "goal_stall" | "blocked_project" | "missing_reviews";
  severity: FindingSeverity;
  title: string;
  evidence: string;
  actions: FindingAction[];
};

export type DetectorTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  estimated_minutes: number | null;
  reschedule_count: number;
};

export type DetectorInput = {
  today: string;
  /** Working minutes in the day, minus fixed non-task time blocks. */
  availableMinutes: number;
  openTasks: DetectorTask[];
  /** Open tasks due today or planned for today. */
  todayTaskIds: string[];
  /** Task IDs in today's top 3. */
  todayPriorityIds: string[];
  /** Plans for the 14 days before today, with outcomes recorded at review time. */
  recentPlans: { plan_date: string; items: { task_id: string | null; priority_rank: number | null; outcome: string | null }[] }[];
  /** Dates with a daily review in the 7 days before today. */
  recentReviewDates: string[];
  /** Current goals, with whether anything was completed for them in the last 14 days. */
  goals: { id: string; title: string; created_at: string; recentlyActive: boolean }[];
  /** Unresolved project blockers. */
  blockers: { projectId: string; projectName: string; description: string; created_at: string }[];
};

const SEVERITY_ORDER: Record<FindingSeverity, number> = { alert: 0, warning: 1, info: 2 };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Which of today's tasks to move so the day fits. Never moves a top-3
 * priority, a task already in progress, or a critical one. Lowest priority
 * first; within a priority, larger estimates first (fewer tasks moved).
 */
export function planOverloadAdjustment(
  tasks: DetectorTask[],
  availableMinutes: number,
  protectedIds: string[],
) {
  const total = tasks.reduce((s, t) => s + (t.estimated_minutes ?? 0), 0);
  const candidates = tasks
    .filter((t) => !protectedIds.includes(t.id) && t.status !== "in_progress" && t.priority !== "critical" && t.estimated_minutes)
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.estimated_minutes! - a.estimated_minutes!);
  const move: DetectorTask[] = [];
  let remaining = total;
  for (const t of candidates) {
    if (remaining <= availableMinutes) break;
    move.push(t);
    remaining -= t.estimated_minutes!;
  }
  return { totalMinutes: total, move, freedMinutes: total - remaining, remainingMinutes: remaining, stillOver: remaining > availableMinutes };
}

export function detectFindings(input: DetectorInput): Finding[] {
  const { today } = input;
  const findings: Finding[] = [];
  const tomorrow = addDays(today, 1);
  const byId = new Map(input.openTasks.map((t) => [t.id, t]));

  // 1. Today is overloaded.
  const todayTasks = input.todayTaskIds.map((id) => byId.get(id)).filter((t): t is DetectorTask => Boolean(t));
  const plan = planOverloadAdjustment(todayTasks, input.availableMinutes, input.todayPriorityIds);
  if (plan.totalMinutes > input.availableMinutes) {
    const over = plan.totalMinutes - input.availableMinutes;
    const actions: FindingAction[] = [];
    if (plan.move.length) {
      actions.push({
        kind: "reschedule_tasks",
        label: `Move ${plural(plan.move.length, "task")} to tomorrow`,
        taskIds: plan.move.map((t) => t.id),
        dueDate: tomorrow,
      });
    }
    actions.push({ kind: "ask_ai", label: "Re-plan with AI", prompt: "Today's plan doesn't fit my working hours. Help me decide what to move, shrink, or drop." });
    findings.push({
      key: `overload:${today}:${plan.totalMinutes}:${input.availableMinutes}`,
      type: "overload",
      severity: "alert",
      title: `Today is ${formatMinutes(over)} over capacity`,
      evidence:
        `Today's open tasks are estimated at ${formatMinutes(plan.totalMinutes)}; you have about ${formatMinutes(input.availableMinutes)} of working time.` +
        (plan.move.length
          ? ` Moving ${plan.move.map((t) => `"${t.title}"`).join(", ")} frees ${formatMinutes(plan.freedMinutes)}${plan.stillOver ? `, but you'd still be ${formatMinutes(plan.remainingMinutes - input.availableMinutes)} over — one of your top priorities may need to wait` : " and makes the day fit"}.`
          : " Everything left is a top priority, critical, or already in progress — something important has to give."),
      actions,
    });
  }

  // 2. Overdue by two or more days.
  const overdue = input.openTasks
    .filter((t) => t.due_date && daysBetween(t.due_date, today) >= 2)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  if (overdue.length) {
    const oldest = daysBetween(overdue[0].due_date!, today);
    const serious = oldest >= 7 || overdue.some((t) => t.priority === "critical" || t.priority === "high");
    findings.push({
      key: `overdue:${overdue.map((t) => t.id).sort().join(",")}`,
      type: "overdue",
      severity: serious ? "warning" : "info",
      title: `${plural(overdue.length, "task")} overdue by two days or more`,
      evidence: overdue.slice(0, 3).map((t) => `"${t.title}" (${daysBetween(t.due_date!, today)} days)`).join(", ") +
        (overdue.length > 3 ? `, and ${overdue.length - 3} more` : "") +
        ". Each needs a decision: do it, give it a realistic date, or cancel it.",
      actions: [
        { kind: "link", label: "Review overdue tasks", href: "/tasks?due=overdue" },
        { kind: "ask_ai", label: "Decide with AI", prompt: "Help me decide what to do with each of my overdue tasks: do it, reschedule it realistically, or drop it." },
      ],
    });
  }

  // 3. Pushed back again and again.
  for (const t of input.openTasks.filter((t) => t.reschedule_count >= 3)) {
    findings.push({
      key: `reschedule:${t.id}:${t.reschedule_count}`,
      type: "repeated_reschedule",
      severity: t.reschedule_count >= 5 ? "warning" : "info",
      title: `"${t.title}" has been pushed back ${t.reschedule_count} times`,
      evidence: "Repeatedly moving a task usually means it's too big, unclear, not actually important, or blocked. Rescheduling it again is unlikely to help.",
      actions: [
        { kind: "ask_ai", label: "Work out why with AI", prompt: `The task "${t.title}" has been pushed back ${t.reschedule_count} times. Help me work out why and what to do: break it down, schedule it properly, get help, or drop it.` },
        { kind: "cancel_task", label: "Drop it", taskId: t.id },
      ],
    });
  }

  // 4. Top priorities that keep not getting done.
  const priorityMisses = new Map<string, number>();
  let reviewedPriorities = 0;
  let donePriorities = 0;
  for (const p of input.recentPlans) {
    for (const i of p.items) {
      if (!i.task_id || !i.priority_rank || !i.outcome) continue;
      reviewedPriorities++;
      if (i.outcome === "done") donePriorities++;
      else priorityMisses.set(i.task_id, (priorityMisses.get(i.task_id) ?? 0) + 1);
    }
  }
  for (const [taskId, misses] of priorityMisses) {
    const t = byId.get(taskId);
    if (!t || misses < 2) continue;
    findings.push({
      key: `priority_fail:${taskId}:${misses}`,
      type: "failed_priority",
      severity: misses >= 3 ? "warning" : "info",
      title: `"${t.title}" was a top priority on ${misses} days without getting done`,
      evidence: "Choosing the same priority again without changing anything tends to give the same result. Try a smaller first step, a protected time block, or an honest look at whether it matters now.",
      actions: [
        { kind: "ask_ai", label: "Find the blocker with AI", prompt: `"${t.title}" has been one of my top priorities on ${misses} days but still isn't done. Help me find what's getting in the way and a better plan.` },
      ],
    });
  }
  if (reviewedPriorities >= 5 && donePriorities / reviewedPriorities < 0.4) {
    findings.push({
      key: `priority_rate:${today.slice(0, 7)}:${donePriorities}/${reviewedPriorities}`,
      type: "priority_rate",
      severity: "warning",
      title: `Only ${donePriorities} of ${reviewedPriorities} top priorities got done in the last two weeks`,
      evidence: "When most priorities slip, the plan is usually too ambitious for the time available. Fewer, smaller priorities that actually get done beat a list that never does.",
      actions: [{ kind: "ask_ai", label: "Diagnose with AI", prompt: "Most of my top priorities over the last two weeks didn't get done. Look at what happened and help me plan more realistically." }],
    });
  }

  // 5. Goals with no progress.
  for (const g of input.goals) {
    if (g.recentlyActive || daysBetween(g.created_at.slice(0, 10), today) < 14) continue;
    findings.push({
      key: `goal_stall:${g.id}:${today.slice(0, 7)}`,
      type: "goal_stall",
      severity: "info",
      title: `No progress on "${g.title}" in two weeks`,
      evidence: "No linked tasks or milestones were completed in the last 14 days. Decide whether to restart it with one small next action, or put it on hold honestly.",
      actions: [
        { kind: "link", label: "Open goal", href: `/goals/${g.id}` },
        { kind: "ask_ai", label: "Restart or pause?", prompt: `I haven't made progress on my goal "${g.title}" in two weeks. Help me either restart it with a small next step or decide to pause it.` },
      ],
    });
  }

  // 6. Projects blocked for a week or more.
  for (const b of input.blockers) {
    const days = daysBetween(b.created_at.slice(0, 10), today);
    if (days < 7) continue;
    findings.push({
      key: `blocker:${b.projectId}:${b.created_at}`,
      type: "blocked_project",
      severity: days >= 14 ? "warning" : "info",
      title: `${b.projectName} has been blocked for ${days} days`,
      evidence: `Blocker: "${b.description}". A blocker this old usually needs an explicit next step: ask someone, find a workaround, or change the plan.`,
      actions: [
        { kind: "link", label: "Open project", href: `/projects/${b.projectId}` },
        { kind: "ask_ai", label: "Unblock with AI", prompt: `My project "${b.projectName}" has been blocked for ${days} days by: ${b.description}. Help me find a way forward.` },
      ],
    });
  }

  // 7. Planning without reviewing.
  const weekAgo = addDays(today, -7);
  const plannedDays = input.recentPlans.filter((p) => p.plan_date >= weekAgo && p.items.some((i) => i.task_id)).length;
  const reviewedDays = input.recentReviewDates.filter((d) => d >= weekAgo).length;
  if (plannedDays >= 3 && reviewedDays <= 1) {
    findings.push({
      key: `missing_reviews:${weekAgo}`,
      type: "missing_reviews",
      severity: "info",
      title: `You planned ${plannedDays} days this week but reviewed ${reviewedDays}`,
      evidence: "Without end-of-day reviews there's no record of what actually happened, so patterns stay invisible. Two minutes at the end of the day is enough.",
      actions: [{ kind: "link", label: "Go to today's review", href: "/" }],
    });
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
