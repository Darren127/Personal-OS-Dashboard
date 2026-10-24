"use client";

import { useRef } from "react";
import { Loader2, Plus } from "lucide-react";

import { quickAddTask } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";

/** One-line task capture. Optionally pre-linked to a project or goal. */
export function QuickAdd({
  dueTodayDefault = false,
  projectId,
  goalId,
  placeholder = "Add a task…",
}: {
  dueTodayDefault?: boolean;
  projectId?: string;
  goalId?: string;
  placeholder?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, onSubmit } = useFormAction(quickAddTask, {
    onSuccess: () => {
      const input = formRef.current?.elements.namedItem("title") as HTMLInputElement | null;
      if (input) {
        input.value = "";
        input.focus();
      }
    },
  });

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      {projectId && <input type="hidden" name="project_id" value={projectId} />}
      {goalId && <input type="hidden" name="goal_id" value={goalId} />}
      <Input
        name="title"
        placeholder={placeholder}
        aria-label="New task title"
        maxLength={300}
        required
        className="min-w-48 flex-1"
      />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
        <input
          type="checkbox"
          name="due_today"
          defaultChecked={dueTodayDefault}
          className="size-4 cursor-pointer accent-[var(--primary)]"
        />
        Due today
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Plus />}
        Add
      </Button>
    </form>
  );
}
