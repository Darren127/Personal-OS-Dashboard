"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";

import { createProject, updateProject } from "@/app/actions/projects";
import { errorProps, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";
import { PRIORITIES, PRIORITY_LABEL, PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";

type Project = Database["public"]["Tables"]["projects"]["Row"];

function ProjectForm({ project, onDone, onCancel }: {
  project?: Project;
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const action = project ? updateProject.bind(null, project.id) : createProject;
  const { pending, onSubmit, fieldErrors: e } = useFormAction(action, { onSuccess: (r) => r.data && onDone(r.data.id) });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField id="project-name" label="Project name" error={e.name}>
        <Input id="project-name" name="name" defaultValue={project?.name} maxLength={200} autoFocus {...errorProps("project-name", e.name)} />
      </FormField>
      <FormField id="project-objective" label="Objective" hint="One sentence: what does 'done' look like?">
        <Input id="project-objective" name="objective" defaultValue={project?.objective ?? ""} maxLength={2000} />
      </FormField>
      <FormField id="project-description" label="Description">
        <Textarea id="project-description" name="description" defaultValue={project?.description ?? ""} rows={3} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="project-status" label="Status">
          <NativeSelect id="project-status" name="status" defaultValue={project?.status ?? "planning"}>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
          </NativeSelect>
        </FormField>
        <FormField id="project-priority" label="Priority">
          <NativeSelect id="project-priority" name="priority" defaultValue={project?.priority ?? "medium"}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </NativeSelect>
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="project-start" label="Start date">
          <Input id="project-start" name="start_date" type="date" defaultValue={project?.start_date ?? ""} />
        </FormField>
        <FormField id="project-target" label="Target deadline" error={e.target_date}>
          <Input id="project-target" name="target_date" type="date" defaultValue={project?.target_date ?? ""} {...errorProps("project-target", e.target_date)} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {project ? "Save project" : "Create project"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ProjectDialogButton({ project }: { project?: Project }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      {project ? (
        <Button variant="outline" onClick={() => setOpen(true)}><Pencil /> Edit</Button>
      ) : (
        <Button onClick={() => setOpen(true)}><Plus /> New project</Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
            <DialogDescription>A project is a finite outcome that takes several tasks to reach.</DialogDescription>
          </DialogHeader>
          {open && (
            <ProjectForm
              project={project}
              onCancel={() => setOpen(false)}
              onDone={(id) => {
                setOpen(false);
                if (!project) router.push(`/projects/${id}`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
