"use client";

import { useState, useTransition } from "react";
import { ArrowRight, CalendarArrowUp, Loader2, Plus, Star, StarOff } from "lucide-react";

import { addPriority, removePriority } from "@/app/actions/my-day";
import { setTaskDueDate } from "@/app/actions/tasks";
import { TaskItem } from "@/components/tasks/task-item";
import { useTaskDialog } from "@/components/tasks/task-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/input";
import { runAction } from "@/hooks/use-form-action";
import { addDays, formatRelativeDate } from "@/lib/dates";
import type { TaskWithLinks } from "@/lib/server/tasks";

function AddToTop3({ taskId }: { taskId: string }) {
  return (
    <DropdownMenuItem onSelect={() => runAction(addPriority(taskId))}>
      <Star /> Add to top 3
    </DropdownMenuItem>
  );
}

/** Tasks due today. */
export function DueTodayList({ tasks, prioritizedIds }: { tasks: TaskWithLinks[]; prioritizedIds: string[] }) {
  return (
    <ul className="-mx-3 flex flex-col">
      {tasks.map((t) => (
        <TaskItem
          key={t.id}
          task={t}
          extraActions={!prioritizedIds.includes(t.id) && t.status !== "done" ? <AddToTop3 taskId={t.id} /> : null}
        />
      ))}
    </ul>
  );
}

/** Overdue tasks, with explicit "decide now" actions. */
export function OverdueList({ tasks }: { tasks: TaskWithLinks[] }) {
  const { today } = useTaskDialog();
  return (
    <ul className="-mx-3 flex flex-col">
      {tasks.map((t) => (
        <TaskItem
          key={t.id}
          task={t}
          extraActions={
            <>
              <DropdownMenuItem onSelect={() => runAction(setTaskDueDate(t.id, today), "Moved to today.")}>
                <ArrowRight /> Do it today
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => runAction(setTaskDueDate(t.id, addDays(today, 1)), "Moved to tomorrow.")}
              >
                <CalendarArrowUp /> Move to tomorrow
              </DropdownMenuItem>
              <AddToTop3 taskId={t.id} />
            </>
          }
        />
      ))}
    </ul>
  );
}

/** Today's top three priorities, plus a picker to fill empty slots. */
export function Priorities({
  priorities,
  candidates,
}: {
  priorities: { itemId: string; rank: number; task: TaskWithLinks }[];
  candidates: { id: string; title: string; due_date: string | null }[];
}) {
  const { today } = useTaskDialog();
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {priorities.length > 0 && (
        <ol className="-mx-3 flex flex-col">
          {priorities.map((p) => (
            <TaskItem
              key={p.itemId}
              task={p.task}
              leading={
                <span
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
                  aria-label={`Priority ${p.rank}`}
                >
                  {p.rank}
                </span>
              }
              extraActions={
                <DropdownMenuItem onSelect={() => runAction(removePriority(p.itemId))}>
                  <StarOff /> Remove from top 3
                </DropdownMenuItem>
              }
            />
          ))}
        </ol>
      )}

      {priorities.length < 3 && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!selected) return;
            startTransition(async () => {
              const r = await runAction(addPriority(selected));
              if (r.ok) setSelected("");
            });
          }}
        >
          <NativeSelect
            aria-label="Choose a task to prioritise"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-w-48 flex-1"
          >
            <option value="">
              {candidates.length ? `Choose priority #${priorities.length + 1}…` : "No open tasks to choose from"}
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.due_date ? ` · ${formatRelativeDate(c.due_date, today)}` : ""}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" variant="outline" disabled={!selected || pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />}
            Add priority
          </Button>
        </form>
      )}
    </div>
  );
}
