/**
 * Shared domain vocabulary: the allowed values for each enum (mirroring the
 * database) and their display labels. Used by validation and UI alike.
 */
import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type TaskStatus = Enums["task_status"];
export type Priority = Enums["priority_level"];
export type GoalCategory = Enums["goal_category"];
export type GoalHorizon = Enums["goal_horizon"];
export type GoalStatus = Enums["goal_status"];
export type ProgressMethod = Enums["progress_method"];
export type ProjectStatus = Enums["project_status"];

export const TASK_STATUSES = ["inbox", "next", "in_progress", "waiting", "done", "cancelled"] as const satisfies readonly TaskStatus[];
export const PRIORITIES = ["low", "medium", "high", "critical"] as const satisfies readonly Priority[];
export const GOAL_CATEGORIES = ["career", "finance", "health_fitness", "learning", "personal_growth", "relationships", "business", "other"] as const satisfies readonly GoalCategory[];
export const GOAL_HORIZONS = ["long_term", "annual", "quarterly", "short_term"] as const satisfies readonly GoalHorizon[];
export const GOAL_STATUSES = ["not_started", "active", "on_hold", "achieved", "abandoned"] as const satisfies readonly GoalStatus[];
export const PROGRESS_METHODS = ["auto", "metric", "milestones", "tasks", "manual"] as const satisfies readonly ProgressMethod[];
export const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"] as const satisfies readonly ProjectStatus[];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: "Inbox",
  next: "Next",
  in_progress: "In Progress",
  waiting: "Waiting",
  done: "Done",
  cancelled: "Cancelled",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

/** Higher = more urgent; used for sorting. */
export const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export const GOAL_CATEGORY_LABEL: Record<GoalCategory, string> = {
  career: "Career",
  finance: "Finance",
  health_fitness: "Health & Fitness",
  learning: "Learning",
  personal_growth: "Personal Growth",
  relationships: "Relationships",
  business: "Business",
  other: "Other",
};

export const GOAL_HORIZON_LABEL: Record<GoalHorizon, string> = {
  long_term: "Long-term",
  annual: "Annual",
  quarterly: "Quarterly",
  short_term: "Short-term",
};

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  not_started: "Not started",
  active: "Active",
  on_hold: "On hold",
  achieved: "Achieved",
  abandoned: "Abandoned",
};

export const PROGRESS_METHOD_LABEL: Record<ProgressMethod, string> = {
  auto: "Automatic (metric → milestones → tasks)",
  metric: "Measurable metric",
  milestones: "Completed milestones",
  tasks: "Completed linked tasks",
  manual: "Manual estimate",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const OPEN_TASK_STATUSES: TaskStatus[] = ["inbox", "next", "in_progress", "waiting"];

export function isOpen(status: TaskStatus) {
  return status !== "done" && status !== "cancelled";
}
