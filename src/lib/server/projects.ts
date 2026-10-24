import "server-only";

import { notFound } from "next/navigation";

import { OPEN_TASK_STATUSES, PROJECT_STATUSES, type ProjectStatus } from "@/lib/domain";
import { TASK_SELECT } from "@/lib/server/tasks";
import { requireUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type ProgressRow = Database["public"]["Views"]["project_progress"]["Row"];

export function describeProjectProgress(p: ProgressRow | undefined | null) {
  const value = p?.progress === null || p?.progress === undefined ? null : Number(p.progress);
  switch (p?.progress_source) {
    case "tasks":
      return { value, explanation: `${p.tasks_done} of ${p.tasks_total} tasks done` };
    case "milestones":
      return { value, explanation: `${p.milestones_done} of ${p.milestones_total} milestones complete` };
    default:
      return { value: null, explanation: "No tasks or milestones yet" };
  }
}

export type ProjectFilter = "current" | ProjectStatus | "all";

export const projectFilter = (v: unknown): ProjectFilter =>
  typeof v === "string" && (v === "all" || (PROJECT_STATUSES as readonly string[]).includes(v))
    ? (v as ProjectFilter)
    : "current";

export async function listProjects(filter: ProjectFilter, today: string) {
  const { supabase } = await requireUser();
  let query = supabase.from("projects").select("*")
    .order("priority", { ascending: false })
    .order("target_date", { ascending: true, nullsFirst: false });
  if (filter === "current") query = query.in("status", ["planning", "active", "on_hold"]);
  else if (filter !== "all") query = query.eq("status", filter);

  const [projects, progress, overdue] = await Promise.all([
    query,
    supabase.from("project_progress").select("*"),
    supabase.from("tasks").select("project_id").not("project_id", "is", null)
      .lt("due_date", today).in("status", OPEN_TASK_STATUSES),
  ]);
  for (const r of [projects, progress, overdue]) {
    if (r.error) throw new Error(`Failed to load projects: ${r.error.message}`);
  }

  const progressById = new Map(progress.data!.map((p) => [p.project_id, p]));
  const overdueCount = new Map<string, number>();
  for (const t of overdue.data!) overdueCount.set(t.project_id!, (overdueCount.get(t.project_id!) ?? 0) + 1);

  return projects.data!.map((p) => {
    const pr = progressById.get(p.id);
    return {
      ...p,
      progress: describeProjectProgress(pr),
      nextMilestoneDue: pr?.next_milestone_due ?? null,
      openBlockers: pr?.open_blockers ?? 0,
      overdueTasks: overdueCount.get(p.id) ?? 0,
    };
  });
}

export type ProjectListItem = Awaited<ReturnType<typeof listProjects>>[number];

export async function getProject(id: string) {
  const { supabase } = await requireUser();
  const project = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (project.error) {
    if (project.error.code === "22P02") notFound();
    throw new Error(`Failed to load project: ${project.error.message}`);
  }
  if (!project.data) notFound();

  const [progress, milestones, tasks, goalLinks, blockers, reviews] = await Promise.all([
    supabase.from("project_progress").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("project_milestones").select("*").eq("project_id", id).order("position").order("created_at"),
    supabase.from("tasks").select(TASK_SELECT).eq("project_id", id)
      .order("due_date", { ascending: true, nullsFirst: false }).order("priority", { ascending: false }),
    supabase.from("project_goals").select("goal:goals(id, title, status)").eq("project_id", id),
    supabase.from("project_blockers").select("*, task:tasks(id, title)").eq("project_id", id)
      .order("resolved_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false }),
    supabase.from("project_reviews").select("*").eq("project_id", id)
      .order("review_date", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  for (const r of [progress, milestones, tasks, goalLinks, blockers, reviews]) {
    if (r.error) throw new Error(`Failed to load project details: ${r.error.message}`);
  }

  return {
    project: project.data,
    progress: describeProjectProgress(progress.data),
    milestones: milestones.data ?? [],
    tasks: tasks.data ?? [],
    goals: (goalLinks.data ?? []).map((l) => l.goal).filter((g) => g !== null),
    blockers: blockers.data ?? [],
    reviews: reviews.data ?? [],
  };
}

export type ProjectDetail = Awaited<ReturnType<typeof getProject>>;
