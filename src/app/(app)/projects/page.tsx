import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertCircle, Ban, CalendarDays, FolderKanban, Milestone } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ProgressSummary } from "@/components/progress-summary";
import { ProjectDialogButton } from "@/components/projects/project-form";
import { CardGridSkeleton } from "@/components/skeletons";
import { PriorityBadge } from "@/components/tasks/task-badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { daysBetween, formatRelativeDate } from "@/lib/dates";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/domain";
import { getToday } from "@/lib/server/preferences";
import { listProjects, projectFilter, type ProjectListItem } from "@/lib/server/projects";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Projects" };

const FILTERS = [
  { value: "current", label: "Current" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

const STATUS_VARIANT: Record<ProjectStatus, "default" | "secondary" | "warning" | "success" | "outline"> = {
  planning: "secondary",
  active: "default",
  on_hold: "warning",
  completed: "success",
  cancelled: "outline",
};

function ProjectCard({ project: p, today }: { project: ProjectListItem; today: string }) {
  const late = p.target_date && daysBetween(today, p.target_date) < 0 && p.status !== "completed" && p.status !== "cancelled";
  return (
    <Link href={`/projects/${p.id}`} className="group block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <Card className="h-full transition-colors group-hover:border-primary/40">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[p.status]}>{PROJECT_STATUS_LABEL[p.status]}</Badge>
            <PriorityBadge priority={p.priority} />
          </div>
          <CardTitle className="mt-2 leading-snug">{p.name}</CardTitle>
          {p.objective && <p className="line-clamp-2 text-sm text-muted-foreground">{p.objective}</p>}
        </CardHeader>
        <CardContent className="mt-auto space-y-3">
          <ProgressSummary value={p.progress.value} explanation={p.progress.explanation} label={`Progress for ${p.name}`} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {p.overdueTasks > 0 && (
              <span className="flex items-center gap-1 font-medium text-destructive">
                <AlertCircle className="size-3" /> {p.overdueTasks} overdue
              </span>
            )}
            {p.openBlockers > 0 && (
              <span className="flex items-center gap-1 font-medium text-warning">
                <Ban className="size-3" /> {p.openBlockers} blocker{p.openBlockers > 1 ? "s" : ""}
              </span>
            )}
            {p.nextMilestoneDue && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Milestone className="size-3" /> Next milestone {formatRelativeDate(p.nextMilestoneDue, today)}
              </span>
            )}
            {p.target_date && (
              <span className={cn("flex items-center gap-1", late ? "font-medium text-destructive" : "text-muted-foreground")}>
                <CalendarDays className="size-3" /> Deadline {formatRelativeDate(p.target_date, today)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

async function ProjectsContent({ searchParams }: { searchParams: PageProps<"/projects">["searchParams"] }) {
  const { status } = await searchParams;
  const filter = projectFilter(status);
  const today = await getToday();
  const projects = await listProjects(filter, today);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter projects" className="flex gap-1 rounded-lg bg-muted p-1">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value === "current" ? "/projects" : `/projects?status=${f.value}`}
              aria-current={filter === f.value ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                filter === f.value ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <ProjectDialogButton />
      </div>
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={filter === "current" ? "No current projects" : "Nothing here"}
          description="A project is any outcome that takes more than one task — a launch, a move, a course."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => <ProjectCard key={p.id} project={p} today={today} />)}
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  return (
    <>
      <PageHeader title="Projects" description="Objectives, milestones, blockers, and the tasks that move them forward." />
      <Suspense fallback={<CardGridSkeleton />}>
        <ProjectsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
