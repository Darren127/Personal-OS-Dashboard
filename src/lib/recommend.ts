import { PRIORITY_RANK, isOpen } from "@/lib/domain";
import type { ProjectDetail } from "@/lib/server/projects";
import type { TaskWithLinks } from "@/lib/server/tasks";

export type Recommendation = { title: string; reason: string; taskId?: string };

/**
 * Rule-based "next most useful action" for a project. Transparent by design:
 * every suggestion says why it was chosen.
 */
export function recommendNextAction(
  data: Pick<ProjectDetail, "project" | "tasks" | "milestones" | "blockers">,
  today: string,
): Recommendation {
  const { project, tasks, milestones, blockers } = data;
  const open = tasks.filter((t) => isOpen(t.status));
  const byUrgency = (a: TaskWithLinks, b: TaskWithLinks) =>
    PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
    (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999");

  if (project.status === "completed" || project.status === "cancelled") {
    return { title: "Nothing to do — this project is closed.", reason: `Status is ${project.status}.` };
  }

  const blocker = blockers.find((b) => !b.resolved_at);
  if (blocker) {
    return {
      title: `Unblock: ${blocker.description}`,
      reason: "An open blocker stops progress; removing it usually unlocks several tasks.",
      taskId: blocker.task_id ?? undefined,
    };
  }

  const overdue = open.filter((t) => t.due_date && t.due_date < today).sort(byUrgency);
  if (overdue.length) {
    return {
      title: overdue[0].title,
      reason: `Overdue since ${overdue[0].due_date}. Do it, give it a realistic new date, or cancel it.`,
      taskId: overdue[0].id,
    };
  }

  const inProgress = open.filter((t) => t.status === "in_progress").sort(byUrgency);
  if (inProgress.length) {
    return { title: inProgress[0].title, reason: "Already in progress — finishing beats starting something new.", taskId: inProgress[0].id };
  }

  const nextMilestone = milestones.find((m) => !m.completed_at);
  if (nextMilestone && !open.some((t) => t.project_milestone_id === nextMilestone.id)) {
    return {
      title: `Plan the tasks for "${nextMilestone.title}"`,
      reason: "The next milestone has no open tasks attached, so nothing is moving it forward.",
    };
  }

  const ready = open.filter((t) => t.status === "next").sort(byUrgency);
  if (ready.length) return { title: ready[0].title, reason: "Highest-priority task marked Next.", taskId: ready[0].id };

  const inbox = open.filter((t) => t.status === "inbox").sort(byUrgency);
  if (inbox.length) {
    return { title: `Triage: ${inbox[0].title}`, reason: "Only unsorted Inbox tasks remain — decide which comes next.", taskId: inbox[0].id };
  }

  const waiting = open.filter((t) => t.status === "waiting");
  if (waiting.length) return { title: `Follow up: ${waiting[0].title}`, reason: "Everything open is waiting on someone else.", taskId: waiting[0].id };

  if (tasks.length === 0) {
    return { title: "Define the first concrete task", reason: "This project has no tasks yet. What's the very first step?" };
  }
  return { title: "Wrap up: review and mark the project complete", reason: "All tasks are done or cancelled." };
}
