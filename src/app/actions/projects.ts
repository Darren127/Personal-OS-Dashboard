"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { dbFailed, formToObject, validationFailed, type ActionResult } from "@/lib/actions";
import { requireUser } from "@/lib/supabase/server";
import { blockerInputSchema, projectInputSchema, projectNotesSchema, type ProjectInput } from "@/lib/validation/project";
import { idSchema } from "@/lib/validation/task";

function toRow(p: ProjectInput) {
  return {
    name: p.name,
    description: p.description ?? null,
    objective: p.objective ?? null,
    status: p.status,
    priority: p.priority,
    start_date: p.start_date ?? null,
    target_date: p.target_date ?? null,
  };
}

export async function createProject(
  _prev: ActionResult<{ id: string }>,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const parsed = projectInputSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const row = { ...toRow(parsed.data), completed_at: parsed.data.status === "completed" ? new Date().toISOString() : null };
  const { data, error } = await supabase.from("projects").insert(row).select("id").single();
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Project created.", data: { id: data.id } };
}

export async function updateProject(
  id: string,
  _prev: ActionResult<{ id: string }>,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid project." };
  const parsed = projectInputSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const current = await supabase.from("projects").select("status, completed_at").eq("id", id).maybeSingle();
  if (current.error) return dbFailed(current.error);
  if (!current.data) return { ok: false, error: "That project no longer exists." };

  const completed_at =
    parsed.data.status !== "completed"
      ? null
      : current.data.status === "completed"
        ? current.data.completed_at
        : new Date().toISOString();

  const { error } = await supabase.from("projects").update({ ...toRow(parsed.data), completed_at }).eq("id", id);
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Project saved.", data: { id } };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid project." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That project no longer exists." };
  redirect("/projects");
}

export async function saveProjectNotes(id: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid project." };
  const parsed = projectNotesSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("projects").update({ notes: parsed.data.notes ?? null })
    .eq("id", id).select("id").maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That project no longer exists." };

  refresh();
  return { ok: true, message: "Notes saved." };
}

export async function addBlocker(projectId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  if (!idSchema.safeParse(projectId).success) return { ok: false, error: "Invalid project." };
  const parsed = blockerInputSchema.safeParse(formToObject(formData));
  if (!parsed.success) return validationFailed(parsed.error);

  const { supabase } = await requireUser();
  const { error } = await supabase.from("project_blockers").insert({
    project_id: projectId,
    description: parsed.data.description,
    task_id: parsed.data.task_id ?? null,
  });
  if (error) return dbFailed(error);

  refresh();
  return { ok: true, message: "Blocker recorded." };
}

export async function setBlockerResolved(id: string, resolved: boolean): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid blocker." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("project_blockers")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id).select("id").maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That blocker no longer exists." };

  refresh();
  return { ok: true, message: resolved ? "Blocker resolved." : "Blocker reopened." };
}

export async function deleteBlocker(id: string): Promise<ActionResult> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: "Invalid blocker." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("project_blockers").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbFailed(error);
  if (!data) return { ok: false, error: "That blocker no longer exists." };

  refresh();
  return { ok: true, message: "Blocker deleted." };
}
