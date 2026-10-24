"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { createTask, updateTask } from "@/app/actions/tasks";
import { errorProps, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";
import { utcIsoToZonedLocal } from "@/lib/dates";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
} from "@/lib/domain";
import type { LinkOptions, TaskWithLinks } from "@/lib/server/tasks";

export type TaskDefaults = Partial<
  Pick<TaskWithLinks, "status" | "priority" | "due_date" | "project_id" | "goal_id" | "project_milestone_id" | "goal_milestone_id">
>;

export function TaskForm({
  task,
  defaults,
  options,
  timezone,
  onDone,
  onCancel,
}: {
  task?: TaskWithLinks;
  defaults?: TaskDefaults;
  options: LinkOptions;
  timezone: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const action = task ? updateTask.bind(null, task.id) : createTask;
  const { pending, onSubmit, fieldErrors: e } = useFormAction(action, { onSuccess: onDone });
  const v = task ?? defaults ?? {};

  // Milestone choices depend on the selected project/goal.
  const [projectId, setProjectId] = useState(v.project_id ?? "");
  const [goalId, setGoalId] = useState(v.goal_id ?? "");
  const projectMilestones = options.projectMilestones.filter((m) => m.project_id === projectId);
  const goalMilestones = options.goalMilestones.filter((m) => m.goal_id === goalId);

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <FormField id="task-title" label="Title" error={e.title}>
        <Input
          id="task-title"
          name="title"
          defaultValue={task?.title}
          maxLength={300}
          required
          autoFocus
          placeholder="What needs doing?"
          {...errorProps("task-title", e.title)}
        />
      </FormField>

      <FormField id="task-description" label="Description" error={e.description}>
        <Textarea id="task-description" name="description" defaultValue={task?.description ?? ""} rows={3} />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField id="task-status" label="Status">
          <NativeSelect id="task-status" name="status" defaultValue={v.status ?? "inbox"}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="task-priority" label="Priority">
          <NativeSelect id="task-priority" name="priority" defaultValue={v.priority ?? "medium"}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField id="task-due" label="Due date" error={e.due_date}>
          <Input id="task-due" name="due_date" type="date" defaultValue={v.due_date ?? ""} {...errorProps("task-due", e.due_date)} />
        </FormField>
        <FormField id="task-start" label="Start date" error={e.start_date}>
          <Input id="task-start" name="start_date" type="date" defaultValue={task?.start_date ?? ""} />
        </FormField>
      </div>

      <FormField
        id="task-scheduled"
        label="Scheduled time"
        error={e.scheduled_start}
        hint={`Your timezone: ${timezone}`}
      >
        <Input
          id="task-scheduled"
          name="scheduled_start"
          type="datetime-local"
          defaultValue={task?.scheduled_start ? utcIsoToZonedLocal(task.scheduled_start, timezone) : ""}
          {...errorProps("task-scheduled", e.scheduled_start)}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField id="task-estimate" label="Estimate (minutes)" error={e.estimated_minutes}>
          <Input
            id="task-estimate"
            name="estimated_minutes"
            type="number"
            min={1}
            step={5}
            inputMode="numeric"
            defaultValue={task?.estimated_minutes ?? ""}
            {...errorProps("task-estimate", e.estimated_minutes)}
          />
        </FormField>
        <FormField id="task-actual" label="Actual (minutes)" error={e.actual_minutes}>
          <Input
            id="task-actual"
            name="actual_minutes"
            type="number"
            min={0}
            step={5}
            inputMode="numeric"
            defaultValue={task?.actual_minutes ?? ""}
            {...errorProps("task-actual", e.actual_minutes)}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField id="task-project" label="Project">
          <NativeSelect
            id="task-project"
            name="project_id"
            value={projectId}
            onChange={(ev) => setProjectId(ev.target.value)}
          >
            <option value="">None</option>
            {options.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="task-goal" label="Life goal">
          <NativeSelect id="task-goal" name="goal_id" value={goalId} onChange={(ev) => setGoalId(ev.target.value)}>
            <option value="">None</option>
            {options.goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>

      {(projectMilestones.length > 0 || goalMilestones.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {projectMilestones.length > 0 ? (
            <FormField id="task-pm" label="Project milestone">
              <NativeSelect key={projectId} id="task-pm" name="project_milestone_id" defaultValue={v.project_milestone_id ?? ""}>
                <option value="">None</option>
                {projectMilestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : (
            <div />
          )}
          {goalMilestones.length > 0 && (
            <FormField id="task-gm" label="Goal milestone">
              <NativeSelect key={goalId} id="task-gm" name="goal_milestone_id" defaultValue={v.goal_milestone_id ?? ""}>
                <option value="">None</option>
                {goalMilestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}
        </div>
      )}

      <FormField id="task-tags" label="Tags" error={e.tags} hint="Separate with commas, e.g. deep-work, errands">
        <Input
          id="task-tags"
          name="tags"
          defaultValue={task?.tags.join(", ") ?? ""}
          list="task-tag-options"
          autoComplete="off"
        />
        <datalist id="task-tag-options">
          {options.tags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {task ? "Save changes" : "Create task"}
        </Button>
      </DialogFooter>
    </form>
  );
}
