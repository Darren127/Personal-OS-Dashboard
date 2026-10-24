"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";

import { createGoal, updateGoal } from "@/app/actions/goals";
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
import {
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABEL,
  GOAL_HORIZONS,
  GOAL_HORIZON_LABEL,
  GOAL_STATUSES,
  GOAL_STATUS_LABEL,
  PROGRESS_METHODS,
  PROGRESS_METHOD_LABEL,
  type ProgressMethod,
} from "@/lib/domain";
import type { Database } from "@/lib/supabase/database.types";

type Goal = Database["public"]["Tables"]["goals"]["Row"];
type GoalOption = { id: string; title: string };

function GoalForm({
  goal,
  goals,
  onDone,
  onCancel,
}: {
  goal?: Goal;
  goals: GoalOption[];
  onDone: (id: string) => void;
  onCancel: () => void;
}) {
  const action = goal ? updateGoal.bind(null, goal.id) : createGoal;
  const { pending, onSubmit, fieldErrors: e } = useFormAction(action, {
    onSuccess: (r) => r.data && onDone(r.data.id),
  });
  const [method, setMethod] = useState<ProgressMethod>(goal?.progress_method ?? "auto");
  const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField id="goal-title" label="Goal" error={e.title}>
        <Input id="goal-title" name="title" defaultValue={goal?.title} maxLength={200} autoFocus
          placeholder="e.g. Run a half marathon" {...errorProps("goal-title", e.title)} />
      </FormField>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FormField id="goal-category" label="Category">
          <NativeSelect id="goal-category" name="category" defaultValue={goal?.category ?? "personal_growth"}>
            {GOAL_CATEGORIES.map((c) => <option key={c} value={c}>{GOAL_CATEGORY_LABEL[c]}</option>)}
          </NativeSelect>
        </FormField>
        <FormField id="goal-horizon" label="Horizon">
          <NativeSelect id="goal-horizon" name="horizon" defaultValue={goal?.horizon ?? "annual"}>
            {GOAL_HORIZONS.map((h) => <option key={h} value={h}>{GOAL_HORIZON_LABEL[h]}</option>)}
          </NativeSelect>
        </FormField>
        <FormField id="goal-status" label="Status">
          <NativeSelect id="goal-status" name="status" defaultValue={goal?.status ?? "active"}>
            {GOAL_STATUSES.map((s) => <option key={s} value={s}>{GOAL_STATUS_LABEL[s]}</option>)}
          </NativeSelect>
        </FormField>
      </div>

      <FormField id="goal-why" label="Why does this matter to you?" hint="Your future self will read this when motivation dips.">
        <Textarea id="goal-why" name="why_it_matters" defaultValue={goal?.why_it_matters ?? ""} rows={2} />
      </FormField>

      <FormField id="goal-criteria" label="How will you know you've succeeded?" hint="Make it measurable: a number, a date, a clear yes/no.">
        <Textarea id="goal-criteria" name="success_criteria" defaultValue={goal?.success_criteria ?? ""} rows={2} />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField id="goal-target" label="Target date" error={e.target_date}>
          <Input id="goal-target" name="target_date" type="date" defaultValue={goal?.target_date ?? ""} />
        </FormField>
        <FormField id="goal-parent" label="Part of a bigger goal?" error={e.parent_goal_id}>
          <NativeSelect id="goal-parent" name="parent_goal_id" defaultValue={goal?.parent_goal_id ?? ""}>
            <option value="">No</option>
            {goals.filter((g) => g.id !== goal?.id).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </NativeSelect>
        </FormField>
      </div>

      <fieldset className="space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Measuring progress</legend>
        <FormField id="goal-method" label="Progress is calculated from">
          <NativeSelect id="goal-method" name="progress_method" value={method}
            onChange={(ev) => setMethod(ev.target.value as ProgressMethod)}>
            {PROGRESS_METHODS.map((m) => <option key={m} value={m}>{PROGRESS_METHOD_LABEL[m]}</option>)}
          </NativeSelect>
        </FormField>

        {(method === "metric" || method === "auto") && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormField id="goal-metric-name" label="Metric (optional)">
                <Input id="goal-metric-name" name="metric_name" defaultValue={goal?.metric_name ?? ""} placeholder="e.g. Savings" maxLength={100} />
              </FormField>
              <FormField id="goal-metric-unit" label="Unit">
                <Input id="goal-metric-unit" name="metric_unit" defaultValue={goal?.metric_unit ?? ""} placeholder="e.g. USD, km, kg" maxLength={30} />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FormField id="goal-mstart" label="Start" error={e.metric_start}>
                <Input id="goal-mstart" name="metric_start" type="number" step="any" defaultValue={num(goal?.metric_start)} {...errorProps("goal-mstart", e.metric_start)} />
              </FormField>
              <FormField id="goal-mcurrent" label="Current" error={e.metric_current}>
                <Input id="goal-mcurrent" name="metric_current" type="number" step="any" defaultValue={num(goal?.metric_current)} {...errorProps("goal-mcurrent", e.metric_current)} />
              </FormField>
              <FormField id="goal-mtarget" label="Target" error={e.metric_target}>
                <Input id="goal-mtarget" name="metric_target" type="number" step="any" defaultValue={num(goal?.metric_target)} {...errorProps("goal-mtarget", e.metric_target)} />
              </FormField>
            </div>
            {method === "auto" && (
              <p className="text-xs text-muted-foreground">
                Leave the metric blank to measure by milestones, then by linked tasks.
              </p>
            )}
          </>
        )}

        {method === "manual" && (
          <FormField id="goal-manual" label="Your estimate (%)" error={e.manual_progress}
            hint="Shown as an estimate, not a measurement. Prefer a metric or milestones when you can.">
            <Input id="goal-manual" name="manual_progress" type="number" min={0} max={100} defaultValue={num(goal?.manual_progress)} {...errorProps("goal-manual", e.manual_progress)} />
          </FormField>
        )}
      </fieldset>

      <FormField id="goal-description" label="Notes">
        <Textarea id="goal-description" name="description" defaultValue={goal?.description ?? ""} rows={2} />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {goal ? "Save goal" : "Create goal"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function GoalDialogButton({ goal, goals }: { goal?: Goal; goals: GoalOption[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      {goal ? (
        <Button variant="outline" onClick={() => setOpen(true)}><Pencil /> Edit</Button>
      ) : (
        <Button onClick={() => setOpen(true)}><Plus /> New goal</Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
            <DialogDescription>
              A good goal says what, why, and how you&apos;ll know it&apos;s done.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <GoalForm
              goal={goal}
              goals={goals}
              onCancel={() => setOpen(false)}
              onDone={(id) => {
                setOpen(false);
                if (!goal) router.push(`/goals/${id}`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
