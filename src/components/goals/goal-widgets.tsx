"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteGoal, updateGoalMetric } from "@/app/actions/goals";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runAction, useFormAction } from "@/hooks/use-form-action";

export function MetricUpdate({ goalId, current, unit }: { goalId: string; current: number; unit: string | null }) {
  const { pending, onSubmit, fieldErrors: e } = useFormAction(updateGoalMetric.bind(null, goalId));
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2" noValidate>
      <label htmlFor="metric-current" className="text-sm text-muted-foreground">
        New measurement{unit ? ` (${unit})` : ""}
      </label>
      <Input id="metric-current" name="metric_current" type="number" step="any" defaultValue={current}
        className="w-32" aria-invalid={e.metric_current ? true : undefined} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Update
      </Button>
    </form>
  );
}

export function DeleteGoalButton({ goalId, title }: { goalId: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Delete goal" onClick={() => setOpen(true)}>
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete "${title}"?`}
        description="Its milestones and review notes are deleted too. Linked tasks and projects are kept but unlinked. If you've simply stopped pursuing it, set the status to Abandoned instead — that keeps the history."
        onConfirm={() => runAction(deleteGoal(goalId))}
      />
    </>
  );
}
