"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, Trash2 } from "lucide-react";

import { addBlocker, deleteBlocker, deleteProject, saveProjectNotes, setBlockerResolved } from "@/app/actions/projects";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { runAction, useFormAction } from "@/hooks/use-form-action";
import { cn } from "@/lib/utils";

type Blocker = {
  id: string;
  description: string;
  resolved_at: string | null;
  task: { id: string; title: string } | null;
};

export function Blockers({
  projectId,
  blockers,
  tasks,
}: {
  projectId: string;
  blockers: Blocker[];
  tasks: { id: string; title: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, onSubmit, fieldErrors: e } = useFormAction(addBlocker.bind(null, projectId), {
    onSuccess: () => formRef.current?.reset(),
  });
  const [showResolved, setShowResolved] = useState(false);
  const open = blockers.filter((b) => !b.resolved_at);
  const resolved = blockers.filter((b) => b.resolved_at);

  const row = (b: Blocker) => (
    <li key={b.id} className="group flex items-start gap-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className={cn(b.resolved_at && "text-muted-foreground line-through")}>{b.description}</p>
        {b.task && <p className="text-xs text-muted-foreground">Blocks: {b.task.title}</p>}
      </div>
      <Button variant="ghost" size="sm" className="h-7"
        onClick={() => runAction(setBlockerResolved(b.id, !b.resolved_at))}>
        {b.resolved_at ? <><RotateCcw /> Reopen</> : <><CheckCircle2 /> Resolved</>}
      </Button>
      <Button variant="ghost" size="icon" className="size-7 opacity-50 group-hover:opacity-100"
        aria-label={`Delete blocker "${b.description}"`} onClick={() => runAction(deleteBlocker(b.id))}>
        <Trash2 />
      </Button>
    </li>
  );

  return (
    <div className="space-y-3">
      {open.length > 0 ? <ul className="space-y-2">{open.map(row)}</ul> : <p className="text-sm text-muted-foreground">Nothing blocking this project.</p>}
      {resolved.length > 0 && (
        <div>
          <button type="button" className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? "Hide" : "Show"} {resolved.length} resolved
          </button>
          {showResolved && <ul className="mt-2 space-y-2">{resolved.map(row)}</ul>}
        </div>
      )}
      <form ref={formRef} onSubmit={onSubmit} className="space-y-2 border-t pt-3" noValidate>
        <Input name="description" placeholder="What's in the way?" aria-label="New blocker" maxLength={2000}
          aria-invalid={e.description ? true : undefined} />
        {e.description && <p className="text-xs text-destructive">{e.description}</p>}
        <div className="flex gap-2">
          {tasks.length > 0 && (
            <NativeSelect name="task_id" aria-label="Blocked task (optional)" className="min-w-0 flex-1">
              <option value="">Not tied to a specific task</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </NativeSelect>
          )}
          <Button type="submit" variant="outline" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Add blocker
          </Button>
        </div>
      </form>
    </div>
  );
}

export function ProjectNotes({ projectId, notes }: { projectId: string; notes: string }) {
  const { pending, onSubmit } = useFormAction(saveProjectNotes.bind(null, projectId));
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Textarea name="notes" defaultValue={notes} rows={5} aria-label="Project notes" placeholder="Decisions, links, context…" />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Save notes
      </Button>
    </form>
  );
}

export function DeleteProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Delete project" onClick={() => setOpen(true)}>
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete "${name}"?`}
        description="Its milestones, blockers, and review history are deleted. Its tasks are kept but unlinked. To keep the history, set the status to Completed or Cancelled instead."
        onConfirm={() => runAction(deleteProject(projectId))}
      />
    </>
  );
}
