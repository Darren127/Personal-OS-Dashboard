"use server";

import { refresh } from "next/cache";

import {
  dbFailed,
  formToObject,
  validationFailed,
  type ActionResult,
} from "@/lib/actions";
import { zonedLocalToUtcIso } from "@/lib/dates";
import { getPreferences, getToday } from "@/lib/server/preferences";
import { requireUser } from "@/lib/supabase/server";
import {
  idSchema,
  quickTaskSchema,
  taskInputSchema,
  taskPrioritySchema,
  taskStatusSchema,
  type TaskInput,
} from "@/lib/validation/task";

/** Convert validated form input into a database row. Blank fields become null. */
async function toRow(input: TaskInput) {
  const { timezone } = await getPreferences();
  return {
    title: input.title,
    description: input.description ?? null,
    status: input.status,
    priority: input.priority,
    due_date: input.due_date ?? null,
    start_date: input.start_date ?? null,
    scheduled_start: input.scheduled_start
      ? zonedLocalToUtcIso(input.scheduled_start, timezone)
      : null,
    estimated_minutes: input.estimated_minutes ?? null,
    actual_minutes: input.actual_minutes ?? null,
    project_id: input.project_id ?? null,
    goal_id: input.goal_id ?? null,
    project_milestone_id: input.project_milestone_id ?? null,
    goal_milestone_id: input.goal_milestone_id ?? null,
    tags: input.tags,
  };
}

export async function createTask(
  _prev: ActionResult<{ id: string }>,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = taskInputSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("tasks")
    .insert(await toRow(parsed.data))
    .select("id")
    .single();
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Task created.", data: { id: data.id } };
}

export async function updateTask(
  id: string,
  _prev: ActionResult<{ id: string }>,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid task." };
  const parsed = taskInputSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("tasks")
    .update(await toRow(parsed.data))
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That task no longer exists." };

  refresh();
  return { ok: true, message: "Task saved.", data: { id } };
}

export async function quickAddTask(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = quickTaskSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const dueToday = parsed.data.due_today === "on";
  const { error } = await supabase.from("tasks").insert({
    title: parsed.data.title,
    // A task due today is already decided on; everything else lands in Inbox.
    status: dueToday ? "next" : "inbox",
    due_date: dueToday ? await getToday() : null,
    project_id: parsed.data.project_id ?? null,
    goal_id: parsed.data.goal_id ?? null,
  });
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: dueToday ? "Added to today." : "Added to Inbox." };
}

export async function setTaskStatus(id: string, status: string): Promise<ActionResult> {
  const parsed = taskStatusSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: "Invalid status change." };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That task no longer exists." };

  refresh();
  return { ok: true };
}

export async function setTaskPriority(id: string, priority: string): Promise<ActionResult> {
  const parsed = taskPrioritySchema.safeParse({ id, priority });
  if (!parsed.success) return { ok: false, error: "Invalid priority." };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("tasks")
    .update({ priority: parsed.data.priority })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That task no longer exists." };

  refresh();
  return { ok: true };
}

/** Move a task's due date (e.g. "do it tomorrow"). Counts as a reschedule if later. */
export async function setTaskDueDate(id: string, dueDate: string | null): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid task." };
  if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { ok: false, error: "Invalid date." };
  }
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("tasks")
    .update({ due_date: dueDate })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That task no longer exists." };

  refresh();
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid task." };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That task no longer exists." };

  refresh();
  return { ok: true, message: "Task deleted." };
}
