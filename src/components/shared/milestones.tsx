"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { addMilestone, deleteMilestone, setMilestoneDone } from "@/app/actions/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { runAction, useFormAction } from "@/hooks/use-form-action";
import { daysBetween, formatRelativeDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Milestone = { id: string; title: string; due_date: string | null; completed_at: string | null };

function MilestoneRow({ kind, m, today }: { kind: "goal" | "project"; m: Milestone; today: string }) {
  const [, startTransition] = useTransition();
  const [done, setDone] = useOptimistic(Boolean(m.completed_at));
  const [confirm, setConfirm] = useState(false);
  const overdue = !done && m.due_date && daysBetween(today, m.due_date) < 0;

  return (
    <li className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/60">
      <Checkbox
        checked={done}
        aria-label={done ? `Mark milestone "${m.title}" as not done` : `Mark milestone "${m.title}" as done`}
        onCheckedChange={(c) =>
          startTransition(async () => {
            setDone(Boolean(c));
            await runAction(setMilestoneDone(kind, m.id, Boolean(c)));
          })
        }
      />
      <span className={cn("min-w-0 flex-1 text-sm", done && "text-muted-foreground line-through")}>{m.title}</span>
      {m.due_date && (
        <span className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
          {formatRelativeDate(m.due_date, today)}
        </span>
      )}
      <Button variant="ghost" size="icon" className="size-7 opacity-50 group-hover:opacity-100"
        aria-label={`Delete milestone "${m.title}"`} onClick={() => setConfirm(true)}>
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Delete this milestone?"
        description="Tasks linked to it are kept; they just won't be attached to a milestone anymore."
        onConfirm={() => runAction(deleteMilestone(kind, m.id))}
      />
    </li>
  );
}

export function Milestones({
  kind,
  parentId,
  milestones,
  today,
}: {
  kind: "goal" | "project";
  parentId: string;
  milestones: Milestone[];
  today: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, onSubmit, fieldErrors: e } = useFormAction(addMilestone.bind(null, kind, parentId), {
    onSuccess: () => formRef.current?.reset(),
  });

  return (
    <div className="space-y-3">
      {milestones.length > 0 ? (
        <ul className="-mx-2">
          {milestones.map((m) => <MilestoneRow key={m.id} kind={kind} m={m} today={today} />)}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Break this into 3–7 checkpoints. Each should be something you can clearly call done.
        </p>
      )}
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap gap-2" noValidate>
        <Input name="title" placeholder="New milestone" aria-label="New milestone title" maxLength={200}
          className="min-w-40 flex-1" aria-invalid={e.title ? true : undefined} />
        <Input name="due_date" type="date" aria-label="Milestone due date" className="w-auto" />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus />} Add
        </Button>
        {e.title && <p className="w-full text-xs text-destructive">{e.title}</p>}
      </form>
    </div>
  );
}
