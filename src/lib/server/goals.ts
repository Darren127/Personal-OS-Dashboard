import "server-only";

import { notFound } from "next/navigation";

import { GOAL_STATUSES, type GoalStatus } from "@/lib/domain";
import { TASK_SELECT } from "@/lib/server/tasks";
import { requireUser } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
type ProgressRow = Database["public"]["Views"]["goal_progress"]["Row"];

export type GoalProgress = {
  value: number | null;
  source: "metric" | "milestones" | "tasks" | "manual" | "none";
  explanation: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

/** Turn the database's calculated progress into a value plus a plain-English source. */
export function describeProgress(goal: GoalRow, p: ProgressRow | undefined): GoalProgress {
  const source = (p?.progress_source ?? "none") as GoalProgress["source"];
  const value = p?.progress === null || p?.progress === undefined ? null : Number(p.progress);
  const unit = goal.metric_unit ? ` ${goal.metric_unit}` : "";
  switch (source) {
    case "metric":
      return {
        value,
        source,
        explanation: `${goal.metric_name ? `${goal.metric_name}: ` : ""}${fmt(Number(goal.metric_current))}${unit} — started at ${fmt(Number(goal.metric_start))}, target ${fmt(Number(goal.metric_target))}${unit}`,
      };
    case "milestones":
      return { value, source, explanation: `${p!.milestones_done} of ${p!.milestones_total} milestones complete` };
    case "tasks":
      return { value, source, explanation: `${p!.tasks_done} of ${p!.tasks_total} linked tasks done` };
    case "manual":
      return { value, source, explanation: "Your own estimate (not measured)" };
    default:
      return {
        value: null,
        source: "none",
        explanation: "No measurable data yet — add a metric, milestones, or linked tasks.",
      };
  }
}

export async function listGoals(status: GoalStatus | "open" | "all") {
  const { supabase } = await requireUser();
  let query = supabase.from("goals").select("*").order("target_date", { ascending: true, nullsFirst: false });
  if (status === "open") query = query.in("status", ["not_started", "active", "on_hold"]);
  else if (status !== "all") query = query.eq("status", status);

  const [goals, progress] = await Promise.all([query, supabase.from("goal_progress").select("*")]);
  if (goals.error) throw new Error(`Failed to load goals: ${goals.error.message}`);
  if (progress.error) throw new Error(`Failed to load goal progress: ${progress.error.message}`);

  const byId = new Map(progress.data.map((p) => [p.goal_id, p]));
  return goals.data.map((g) => ({ ...g, progress: describeProgress(g, byId.get(g.id)) }));
}

export type GoalWithProgress = Awaited<ReturnType<typeof listGoals>>[number];

export async function getGoal(id: string) {
  const { supabase } = await requireUser();
  const goal = await supabase.from("goals").select("*").eq("id", id).maybeSingle();
  if (goal.error) {
    if (goal.error.code === "22P02") notFound(); // not a valid UUID
    throw new Error(`Failed to load goal: ${goal.error.message}`);
  }
  if (!goal.data) notFound();

  const [progress, milestones, tasks, projectLinks, reviews, parent, children] = await Promise.all([
    supabase.from("goal_progress").select("*").eq("goal_id", id).maybeSingle(),
    supabase.from("goal_milestones").select("*").eq("goal_id", id).order("position").order("created_at"),
    supabase.from("tasks").select(TASK_SELECT).eq("goal_id", id)
      .order("status").order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("project_goals").select("project:projects(id, name, status, target_date)").eq("goal_id", id),
    supabase.from("goal_reviews").select("*").eq("goal_id", id).order("review_date", { ascending: false })
      .order("created_at", { ascending: false }),
    goal.data.parent_goal_id
      ? supabase.from("goals").select("id, title").eq("id", goal.data.parent_goal_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("goals").select("id, title, status").eq("parent_goal_id", id).order("created_at"),
  ]);
  for (const r of [progress, milestones, tasks, projectLinks, reviews, parent, children]) {
    if (r.error) throw new Error(`Failed to load goal details: ${r.error.message}`);
  }

  return {
    goal: goal.data,
    progress: describeProgress(goal.data, progress.data ?? undefined),
    milestones: milestones.data ?? [],
    tasks: tasks.data ?? [],
    projects: (projectLinks.data ?? []).map((l) => l.project).filter((p) => p !== null),
    reviews: reviews.data ?? [],
    parent: parent.data,
    children: children.data ?? [],
  };
}

export const goalStatusFilter = (v: unknown): GoalStatus | "open" | "all" =>
  typeof v === "string" && (v === "all" || (GOAL_STATUSES as readonly string[]).includes(v))
    ? (v as GoalStatus | "all")
    : "open";
