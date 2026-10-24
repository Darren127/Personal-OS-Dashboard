"use server";

/**
 * Actions shared by goals and projects: milestones, review notes, and the
 * project ↔ goal link.
 */
import { refresh } from "next/cache";
import { z } from "zod";

import { dbFailed, formToObject, validationFailed, type ActionResult } from "@/lib/actions";
import { getToday } from "@/lib/server/preferences";
import { requireUser } from "@/lib/supabase/server";
import { milestoneInputSchema, reviewNoteSchema } from "@/lib/validation/goal";
import { idSchema } from "@/lib/validation/task";

const kindSchema = z.enum(["goal", "project"]);
type Kind = z.infer<typeof kindSchema>;

function valid(kind: Kind, ...ids: string[]) {
  return kindSchema.safeParse(kind).success && ids.every((id) => idSchema.safeParse(id).success);
}

export async function addMilestone(
  kind: Kind,
  parentId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!valid(kind, parentId)) return { ok: false, error: "Invalid request." };
  const parsed = milestoneInputSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const base = { title: parsed.data.title, due_date: parsed.data.due_date ?? null };
  // Append at the end.
  const last =
    kind === "goal"
      ? await supabase.from("goal_milestones").select("position").eq("goal_id", parentId)
          .order("position", { ascending: false }).limit(1).maybeSingle()
      : await supabase.from("project_milestones").select("position").eq("project_id", parentId)
          .order("position", { ascending: false }).limit(1).maybeSingle();
  if (last.error) return dbFailed(last.error);
  const position = (last.data?.position ?? -1) + 1;

  const { error } =
    kind === "goal"
      ? await supabase.from("goal_milestones").insert({ ...base, goal_id: parentId, position })
      : await supabase.from("project_milestones").insert({ ...base, project_id: parentId, position });
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Milestone added." };
}

export async function setMilestoneDone(kind: Kind, id: string, done: boolean): Promise<ActionResult> {
  if (!valid(kind, id)) return { ok: false, error: "Invalid request." };
  const { supabase } = await requireUser();
  const table = kind === "goal" ? "goal_milestones" : "project_milestones";
  const { data, error } = await supabase
    .from(table)
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That milestone no longer exists." };

  refresh();
  return { ok: true, message: done ? "Milestone completed." : undefined };
}

export async function deleteMilestone(kind: Kind, id: string): Promise<ActionResult> {
  if (!valid(kind, id)) return { ok: false, error: "Invalid request." };
  const { supabase } = await requireUser();
  const table = kind === "goal" ? "goal_milestones" : "project_milestones";
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That milestone no longer exists." };

  refresh();
  return { ok: true, message: "Milestone deleted. Linked tasks were kept." };
}

/** Add a dated review note, snapshotting the current calculated progress. */
export async function addReviewNote(
  kind: Kind,
  parentId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!valid(kind, parentId)) return { ok: false, error: "Invalid request." };
  const parsed = reviewNoteSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const review_date = await getToday();
  let error;
  if (kind === "goal") {
    const p = await supabase.from("goal_progress").select("progress").eq("goal_id", parentId).maybeSingle();
    const snapshot = p.data?.progress === null || p.data?.progress === undefined ? null : Number(p.data.progress);
    ({ error } = await supabase
      .from("goal_reviews")
      .insert({ goal_id: parentId, notes: parsed.data.notes, review_date, progress_snapshot: snapshot }));
  } else {
    const p = await supabase.from("project_progress").select("progress").eq("project_id", parentId).maybeSingle();
    const snapshot = p.data?.progress === null || p.data?.progress === undefined ? null : Number(p.data.progress);
    ({ error } = await supabase
      .from("project_reviews")
      .insert({ project_id: parentId, notes: parsed.data.notes, review_date, progress_snapshot: snapshot }));
  }
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Review note added." };
}

export async function linkProjectGoal(projectId: string, goalId: string): Promise<ActionResult> {
  if (!valid("goal", projectId, goalId)) return { ok: false, error: "Invalid request." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("project_goals").insert({ project_id: projectId, goal_id: goalId });
  if (error && error.code !== "23505") return dbFailed(error);

  refresh();
  return { ok: true, message: "Linked." };
}

export async function unlinkProjectGoal(projectId: string, goalId: string): Promise<ActionResult> {
  if (!valid("goal", projectId, goalId)) return { ok: false, error: "Invalid request." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("project_goals").delete().eq("project_id", projectId).eq("goal_id", goalId);
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Unlinked." };
}
