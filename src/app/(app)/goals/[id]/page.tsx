import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, FolderKanban, GitBranch, ListChecks, Milestone, NotebookPen, TrendingUp } from "lucide-react";

import { GoalDialogButton } from "@/components/goals/goal-form";
import { DeleteGoalButton, MetricUpdate } from "@/components/goals/goal-widgets";
import { ProgressSummary } from "@/components/progress-summary";
import { ProjectGoalLinks } from "@/components/shared/link-picker";
import { Milestones } from "@/components/shared/milestones";
import { ReviewNotes } from "@/components/shared/review-notes";
import { Skeleton } from "@/components/skeletons";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskDialogProvider } from "@/components/tasks/task-dialog";
import { TaskList } from "@/components/tasks/task-item";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLongDate } from "@/lib/dates";
import { GOAL_CATEGORY_LABEL, GOAL_HORIZON_LABEL, GOAL_STATUS_LABEL, PROJECT_STATUS_LABEL } from "@/lib/domain";
import { getGoal, listGoals } from "@/lib/server/goals";
import { getPreferences, getToday } from "@/lib/server/preferences";
import { getLinkOptions } from "@/lib/server/tasks";

function Section({ icon: Icon, title, action, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

async function GoalDetail({ params }: { params: PageProps<"/goals/[id]">["params"] }) {
  const { id } = await params;
  const [data, today, prefs, options, allGoals] = await Promise.all([
    getGoal(id), getToday(), getPreferences(), getLinkOptions(), listGoals("all"),
  ]);
  const { goal, progress, milestones, tasks, projects, reviews, parent, children } = data;
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const closedTasks = tasks.filter((t) => t.status === "done" || t.status === "cancelled");

  return (
    <TaskDialogProvider options={options} today={today} timezone={prefs.timezone}>
      <div className="space-y-6">
        <Link href="/goals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Life Goals
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{GOAL_CATEGORY_LABEL[goal.category]}</Badge>
              <Badge variant="outline">{GOAL_HORIZON_LABEL[goal.horizon]}</Badge>
              <Badge variant={goal.status === "achieved" ? "success" : goal.status === "active" ? "default" : "outline"}>
                {GOAL_STATUS_LABEL[goal.status]}
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight break-words">{goal.title}</h1>
            {goal.target_date && <p className="text-sm text-muted-foreground">Target: {formatLongDate(goal.target_date)}</p>}
            {parent && (
              <p className="text-sm text-muted-foreground">
                Part of <Link href={`/goals/${parent.id}`} className="text-foreground underline-offset-4 hover:underline">{parent.title}</Link>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <GoalDialogButton goal={goal} goals={allGoals.map((g) => ({ id: g.id, title: g.title }))} />
            <DeleteGoalButton goalId={goal.id} title={goal.title} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 space-y-6 lg:col-span-3">
            <Section icon={TrendingUp} title="Progress">
              <div className="space-y-4">
                <ProgressSummary value={progress.value} explanation={progress.explanation}
                  estimate={progress.source === "manual"} label="Goal progress" />
                {progress.source === "metric" && goal.metric_current !== null && (
                  <MetricUpdate goalId={goal.id} current={Number(goal.metric_current)} unit={goal.metric_unit} />
                )}
                {(goal.why_it_matters || goal.success_criteria) && (
                  <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
                    {goal.why_it_matters && (
                      <div><dt className="text-xs font-medium text-muted-foreground">Why it matters</dt><dd className="whitespace-pre-wrap">{goal.why_it_matters}</dd></div>
                    )}
                    {goal.success_criteria && (
                      <div><dt className="text-xs font-medium text-muted-foreground">Success looks like</dt><dd className="whitespace-pre-wrap">{goal.success_criteria}</dd></div>
                    )}
                  </dl>
                )}
                {goal.description && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{goal.description}</p>}
              </div>
            </Section>

            <Section icon={Milestone} title="Milestones">
              <Milestones kind="goal" parentId={goal.id} milestones={milestones} today={today} />
            </Section>

            <Section icon={ListChecks} title={`Tasks${tasks.length ? ` · ${openTasks.length} open` : ""}`}
              action={<NewTaskButton variant="ghost" label="Detailed" defaults={{ goal_id: goal.id, status: "next" }} />}>
              <div className="space-y-4">
                <QuickAdd goalId={goal.id} placeholder="Next action for this goal…" />
                {openTasks.length > 0 ? (
                  <TaskList tasks={openTasks} hideLinks="goal" />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No open tasks. What&apos;s the very next physical action that moves this forward?
                  </p>
                )}
                {closedTasks.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">{closedTasks.length} completed or cancelled</summary>
                    <TaskList tasks={closedTasks} hideLinks="goal" />
                  </details>
                )}
              </div>
            </Section>
          </div>

          <div className="min-w-0 space-y-6 lg:col-span-2">
            <Section icon={FolderKanban} title="Projects">
              <ProjectGoalLinks
                from="goal"
                fromId={goal.id}
                linked={projects.map((p) => ({ id: p.id, label: p.name, meta: PROJECT_STATUS_LABEL[p.status] }))}
                available={options.projects.map((p) => ({ id: p.id, label: p.name }))}
              />
            </Section>

            {children.length > 0 && (
              <Section icon={GitBranch} title="Sub-goals">
                <ul className="space-y-1">
                  {children.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/goals/${c.id}`} className="truncate hover:underline">{c.title}</Link>
                      <span className="text-xs text-muted-foreground">{GOAL_STATUS_LABEL[c.status]}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section icon={NotebookPen} title="Review notes">
              <ReviewNotes kind="goal" parentId={goal.id} notes={reviews} today={today} />
            </Section>
          </div>
        </div>
      </div>
    </TaskDialogProvider>
  );
}

export default function GoalPage({ params }: PageProps<"/goals/[id]">) {
  return (
    <Suspense fallback={<div className="space-y-6"><Skeleton className="h-20 w-2/3" /><Skeleton className="h-64 rounded-xl" /></div>}>
      <GoalDetail params={params} />
    </Suspense>
  );
}
