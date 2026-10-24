"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { dbFailed, formToObject, validationFailed, type ActionResult } from "@/lib/actions";
import { requireUser } from "@/lib/supabase/server";
import { goalInputSchema, metricUpdateSchema, type GoalInput } from "@/lib/validation/goal";
import { idSchema } from "@/lib/validation/task";

function toRow(g: GoalInput) {
  return {
    title: g.title,
    description: g.description ?? null,
    category: g.category,
    horizon: g.horizon,
    status: g.status,
    why_it_matters: g.why_it_matters ?? null,
    success_criteria: g.success_criteria ?? null,
    target_date: g.target_date ?? null,
    parent_goal_id: g.parent_goal_id ?? null,
    progress_method: g.progress_method,
    metric_name: g.metric_name ?? null,
    metric_unit: g.metric_unit ?? null,
    metric_start: g.metric_start ?? null,
    metric_target: g.metric_target ?? null,
    metric_current: g.metric_current ?? null,
    manual_progress: g.progress_method === "manual" ? (g.manual_progress ?? null) : null,
    achieved_at: g.status === "achieved" ? new Date().toISOString() : null,
  };
}

export async function createGoal(
  _prev: ActionResult<{ id: string }>,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = goalInputSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("goals").insert(toRow(parsed.data)).select("id").single();
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Goal created.", data: { id: data.id } };
}

export async function updateGoal(
  id: string,
  _prev: ActionResult<{ id: string }>,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid goal." };
  const parsed = goalInputSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);
  if (parsed.data.parent_goal_id === id) {
    return { ok: false, error: "A goal can't be its own parent.", fieldErrors: { parent_goal_id: "Choose a different goal." } };
  }

  const { supabase } = await requireUser();
  const current = await supabase.from("goals").select("status, achieved_at").eq("id", id).maybeSingle();
  if (current.error) return dbFailed(current.error);
  if (!current.data) return { ok: false, error: "That goal no longer exists." };

  const row = toRow(parsed.data);
  // Keep the original achievement date if it was already achieved.
  if (current.data.status === "achieved" && parsed.data.status === "achieved") row.achieved_at = current.data.achieved_at;

  const { error } = await supabase.from("goals").update(row).eq("id", id);
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Goal saved.", data: { id } };
}

/** Record a new measurement for the goal's metric. */
export async function updateGoalMetric(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid goal." };
  const parsed = metricUpdateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("goals")
    .update({ metric_current: parsed.data.metric_current })
    .eq("id", id)
    .not("metric_target", "is", null)
    .select("id")
    .maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "This goal has no metric to update." };

  refresh();
  return { ok: true, message: "Progress updated." };
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid goal." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("goals").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That goal no longer exists." };
  redirect("/goals");
}
