"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Clock, FolderKanban, MoreHorizontal, Pencil, Target, Trash2 } from "lucide-react";

import { deleteTask, setTaskPriority, setTaskStatus } from "@/app/actions/tasks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DueLabel, PriorityBadge, StatusBadge } from "@/components/tasks/task-badges";
import { useTaskDialog } from "@/components/tasks/task-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { runAction } from "@/hooks/use-form-action";
import { formatClockTime, formatMinutes } from "@/lib/dates";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  isOpen,
  type TaskStatus,
} from "@/lib/domain";
import type { TaskWithLinks } from "@/lib/server/tasks";
import { cn } from "@/lib/utils";

export function TaskItem({
  task,
  extraActions,
  hideLinks,
  leading,
  className,
}: {
  task: TaskWithLinks;
  /** Rendered before the checkbox, e.g. a priority rank. */
  leading?: React.ReactNode;
  /** Additional menu items, e.g. "Add to top 3" on My Day. */
  extraActions?: React.ReactNode;
  /** Hide the project/goal chips (e.g. when already on that project's page). */
  hideLinks?: "project" | "goal";
  className?: string;
}) {
  const { today, timezone, openEdit } = useTaskDialog();
  const [, startTransition] = useTransition();
  const [status, setOptimisticStatus] = useOptimistic<TaskStatus>(task.status);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = status === "done";

  function changeStatus(next: TaskStatus) {
    startTransition(async () => {
      setOptimisticStatus(next);
      await runAction(setTaskStatus(task.id, next));
    });
  }

  return (
    <li
      className={cn(
        "group flex min-w-0 items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60",
        className,
      )}
    >
      {leading}
      <Checkbox
        className="mt-0.5"
        checked={done}
        onCheckedChange={(c) => changeStatus(c ? "done" : "next")}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => openEdit(task)}
          className={cn(
            "block max-w-full cursor-pointer text-left text-sm font-medium break-words outline-none hover:underline focus-visible:underline",
            (done || status === "cancelled") && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {status !== "next" && status !== "done" && <StatusBadge status={status} />}
          <PriorityBadge priority={task.priority} />
          {task.due_date && <DueLabel due={task.due_date} today={today} open={isOpen(status)} />}
          {task.scheduled_start && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              {formatClockTime(task.scheduled_start, timezone)}
            </span>
          )}
          {task.estimated_minutes && (
            <span className="text-xs text-muted-foreground">~{formatMinutes(task.estimated_minutes)}</span>
          )}
          {task.project && hideLinks !== "project" && (
            <Link
              href={`/projects/${task.project.id}`}
              className="inline-flex max-w-48 items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
            >
              <FolderKanban className="size-3 shrink-0" />
              <span className="truncate">{task.project.name}</span>
            </Link>
          )}
          {task.goal && hideLinks !== "goal" && (
            <Link
              href={`/goals/${task.goal.id}`}
              className="inline-flex max-w-48 items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
            >
              <Target className="size-3 shrink-0" />
              <span className="truncate">{task.goal.title}</span>
            </Link>
          )}
          {task.tags.map((t) => (
            <Link
              key={t}
              href={`/tasks?tag=${encodeURIComponent(t)}&status=all`}
              className="text-xs text-primary/80 hover:text-primary"
            >
              #{t}
            </Link>
          ))}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Actions for "${task.title}"`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => openEdit(task)}>
            <Pencil /> Edit details
          </DropdownMenuItem>
          {extraActions}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Status</DropdownMenuLabel>
          {TASK_STATUSES.filter((s) => s !== status).map((s) => (
            <DropdownMenuItem key={s} onSelect={() => changeStatus(s)}>
              {TASK_STATUS_LABEL[s]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Priority</DropdownMenuLabel>
          {PRIORITIES.filter((p) => p !== task.priority).map((p) => (
            <DropdownMenuItem key={p} onSelect={() => runAction(setTaskPriority(task.id, p))}>
              {PRIORITY_LABEL[p]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this task?"
        description={`"${task.title}" will be permanently deleted and removed from any daily plans. Consider marking it Cancelled instead to keep a record.`}
        onConfirm={() => runAction(deleteTask(task.id))}
      />
    </li>
  );
}

export function TaskList({
  tasks,
  hideLinks,
  renderExtraActions,
}: {
  tasks: TaskWithLinks[];
  hideLinks?: "project" | "goal";
  renderExtraActions?: (task: TaskWithLinks) => React.ReactNode;
}) {
  return (
    <ul className="-mx-3 flex flex-col">
      {tasks.map((t) => (
        <TaskItem key={t.id} task={t} hideLinks={hideLinks} extraActions={renderExtraActions?.(t)} />
      ))}
    </ul>
  );
}
