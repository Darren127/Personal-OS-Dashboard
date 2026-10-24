import Link from "next/link";
import { Suspense } from "react";
import {
  AlertTriangle,
  Ban,
  ChevronLeft,
  Compass,
  ListChecks,
  Milestone,
  NotebookPen,
  StickyNote,
  Target,
  TrendingUp,
} from "lucide-react";

import { ProgressSummary } from "@/components/progress-summary";
import { ProjectDialogButton } from "@/components/projects/project-form";
import { Blockers, DeleteProjectButton, ProjectNotes } from "@/components/projects/project-widgets";
import { ProjectGoalLinks } from "@/components/shared/link-picker";
import { Milestones } from "@/components/shared/milestones";
import { ReviewNotes } from "@/components/shared/review-notes";
import { Skeleton } from "@/components/skeletons";
import { PriorityBadge } from "@/components/tasks/task-badges";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskDialogProvider } from "@/components/tasks/task-dialog";
import { TaskList } from "@/components/tasks/task-item";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLongDate } from "@/lib/dates";
import { GOAL_STATUS_LABEL, PROJECT_STATUS_LABEL, isOpen } from "@/lib/domain";
import { getPreferences, getToday } from "@/lib/server/preferences";
import { recommendNextAction } from "@/lib/recommend";
import { getProject } from "@/lib/server/projects";
import { getLinkOptions } from "@/lib/server/tasks";

function Section({ icon: Icon, title, action, children, className }: {
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Icon className="size-4 text-muted-foreground" /> {title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

async function ProjectDetail({ params }: { params: PageProps<"/projects/[id]">["params"] }) {
  const { id } = await params;
  const [data, today, prefs, options] = await Promise.all([getProject(id), getToday(), getPreferences(), getLinkOptions()]);
  const { project, progress, milestones, tasks, goals, blockers, reviews } = data;
  const next = recommendNextAction(data, today);
  const open = tasks.filter((t) => isOpen(t.status));
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const current = open.filter((t) => !overdue.includes(t));
  const closed = tasks.filter((t) => !isOpen(t.status));
  const openBlockers = blockers.filter((b) => !b.resolved_at).length;

  return (
    <TaskDialogProvider options={options} today={today} timezone={prefs.timezone}>
      <div className="space-y-6">
        <Link href="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Projects
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={project.status === "active" ? "default" : project.status === "completed" ? "success" : "secondary"}>
                {PROJECT_STATUS_LABEL[project.status]}
              </Badge>
              <PriorityBadge priority={project.priority} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight break-words">{project.name}</h1>
            {project.objective && <p className="text-sm">{project.objective}</p>}
            <p className="text-sm text-muted-foreground">
              {project.start_date && `Started ${formatLongDate(project.start_date)}`}
              {project.start_date && project.target_date && " · "}
              {project.target_date && `Deadline ${formatLongDate(project.target_date)}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <ProjectDialogButton project={project} />
            <DeleteProjectButton projectId={project.id} name={project.name} />
          </div>
        </div>

        <Card className="border-primary/30 bg-accent/40">
          <CardContent className="flex items-start gap-3">
            <Compass className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="space-y-0.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Next recommended action</p>
              <p className="font-medium">{next.title}</p>
              <p className="text-sm text-muted-foreground">{next.reason}</p>
              <p className="text-xs text-muted-foreground/80">Suggested by simple rules. AI suggestions arrive with the AI Companion.</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 space-y-6 lg:col-span-3">
            <Section icon={TrendingUp} title="Progress">
              <ProgressSummary value={progress.value} explanation={progress.explanation} label="Project progress" />
              {project.description && <p className="mt-4 text-sm whitespace-pre-wrap text-muted-foreground">{project.description}</p>}
            </Section>

            {overdue.length > 0 && (
              <Section icon={AlertTriangle} title={<span className="text-destructive">Overdue · {overdue.length}</span>}>
                <TaskList tasks={overdue} hideLinks="project" />
              </Section>
            )}

            <Section icon={ListChecks} title={`Tasks · ${current.length} open`}
              action={<NewTaskButton variant="ghost" label="Detailed" defaults={{ project_id: project.id, status: "next" }} />}>
              <div className="space-y-4">
                <QuickAdd projectId={project.id} placeholder="Add a task to this project…" />
                {current.length > 0 ? (
                  <TaskList tasks={current} hideLinks="project" />
                ) : (
                  <p className="text-sm text-muted-foreground">No open tasks{overdue.length ? " besides the overdue ones" : ""}.</p>
                )}
                {closed.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">{closed.length} completed or cancelled</summary>
                    <TaskList tasks={closed} hideLinks="project" />
                  </details>
                )}
              </div>
            </Section>

            <Section icon={Milestone} title="Milestones">
              <Milestones kind="project" parentId={project.id} milestones={milestones} today={today} />
            </Section>
          </div>

          <div className="min-w-0 space-y-6 lg:col-span-2">
            <Section icon={Ban} title={`Blockers${openBlockers ? ` · ${openBlockers}` : ""}`}>
              <Blockers projectId={project.id} blockers={blockers} tasks={open.map((t) => ({ id: t.id, title: t.title }))} />
            </Section>

            <Section icon={Target} title="Life goals">
              <ProjectGoalLinks
                from="project"
                fromId={project.id}
                linked={goals.map((g) => ({ id: g.id, label: g.title, meta: GOAL_STATUS_LABEL[g.status] }))}
                available={options.goals.map((g) => ({ id: g.id, label: g.title }))}
              />
            </Section>

            <Section icon={StickyNote} title="Notes">
              <ProjectNotes projectId={project.id} notes={project.notes ?? ""} />
            </Section>

            <Section icon={NotebookPen} title="Review history">
              <ReviewNotes kind="project" parentId={project.id} notes={reviews} today={today} />
            </Section>
          </div>
        </div>
      </div>
    </TaskDialogProvider>
  );
}

export default function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={<div className="space-y-6"><Skeleton className="h-20 w-2/3" /><Skeleton className="h-64 rounded-xl" /></div>}>
      <ProjectDetail params={params} />
    </Suspense>
  );
}
