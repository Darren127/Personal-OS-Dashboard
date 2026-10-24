import "server-only";

import { z } from "zod";

import { addDays } from "@/lib/dates";
import { PRIORITIES, TASK_STATUSES, type TaskStatus } from "@/lib/domain";
import type { Db } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/server";

/** Columns every task view needs, plus the names of linked records. */
export const TASK_SELECT =
  "*, project:projects(id, name), goal:goals!tasks_goal_id_user_id_fkey(id, title)" as const;

export async function selectTasks(supabase: Db) {
  return supabase.from("tasks").select(TASK_SELECT);
}

type TaskQuery = Awaited<ReturnType<typeof selectTasks>>;
export type TaskWithLinks = NonNullable<TaskQuery["data"]>[number];

export const taskFiltersSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  status: z.enum([...TASK_STATUSES, "open", "all"]).catch("open"),
  priority: z.enum(PRIORITIES).optional().catch(undefined),
  project: z.union([z.uuid(), z.literal("none")]).optional().catch(undefined),
  goal: z.union([z.uuid(), z.literal("none")]).optional().catch(undefined),
  tag: z.string().trim().max(40).optional().catch(undefined),
  due: z.enum(["overdue", "today", "week", "none", "any"]).catch("any"),
  sort: z.enum(["due", "priority", "created", "updated", "title"]).catch("due"),
});

export type TaskFilters = z.infer<typeof taskFiltersSchema>;

const OPEN: TaskStatus[] = ["inbox", "next", "in_progress", "waiting"];

/** Escape LIKE wildcards in user-typed search text. */
function likeEscape(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listTasks(filters: TaskFilters, today: string) {
  const { supabase } = await requireUser();
  let query = supabase.from("tasks").select(TASK_SELECT);

  if (filters.status === "open") query = query.in("status", OPEN);
  else if (filters.status !== "all") query = query.eq("status", filters.status);

  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.project === "none") query = query.is("project_id", null);
  else if (filters.project) query = query.eq("project_id", filters.project);
  if (filters.goal === "none") query = query.is("goal_id", null);
  else if (filters.goal) query = query.eq("goal_id", filters.goal);
  if (filters.tag) query = query.contains("tags", [filters.tag]);
  if (filters.q) query = query.ilike("title", `%${likeEscape(filters.q)}%`);

  switch (filters.due) {
    case "overdue":
      query = query.lt("due_date", today).in("status", OPEN);
      break;
    case "today":
      query = query.eq("due_date", today);
      break;
    case "week":
      query = query.gte("due_date", today).lte("due_date", addDays(today, 7));
      break;
    case "none":
      query = query.is("due_date", null);
      break;
  }

  switch (filters.sort) {
    case "due":
      query = query
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("priority", { ascending: false });
      break;
    case "priority":
      // Postgres orders enums by declaration: low < medium < high < critical.
      query = query
        .order("priority", { ascending: false })
        .order("due_date", { ascending: true, nullsFirst: false });
      break;
    case "created":
      query = query.order("created_at", { ascending: false });
      break;
    case "updated":
      query = query.order("updated_at", { ascending: false });
      break;
    case "title":
      query = query.order("title", { ascending: true });
      break;
  }

  const { data, error } = await query.limit(500);
  if (error) throw new Error(`Failed to load tasks: ${error.message}`);
  return data;
}

/** Everything a task can be linked to — used to fill form dropdowns. */
export async function getLinkOptions() {
  const { supabase } = await requireUser();
  const [projects, goals, projectMilestones, goalMilestones, tags] = await Promise.all([
    supabase.from("projects").select("id, name, status").order("name"),
    supabase.from("goals").select("id, title, status").order("title"),
    supabase
      .from("project_milestones")
      .select("id, title, project_id")
      .is("completed_at", null)
      .order("position"),
    supabase
      .from("goal_milestones")
      .select("id, title, goal_id")
      .is("completed_at", null)
      .order("position"),
    supabase.from("tasks").select("tags").filter("tags", "neq", "{}").limit(1000),
  ]);
  for (const r of [projects, goals, projectMilestones, goalMilestones, tags]) {
    if (r.error) throw new Error(`Failed to load options: ${r.error.message}`);
  }
  const allTags = [...new Set((tags.data ?? []).flatMap((t) => t.tags))].sort();
  return {
    projects: projects.data ?? [],
    goals: goals.data ?? [],
    projectMilestones: projectMilestones.data ?? [],
    goalMilestones: goalMilestones.data ?? [],
    tags: allTags,
  };
}

export type LinkOptions = Awaited<ReturnType<typeof getLinkOptions>>;
