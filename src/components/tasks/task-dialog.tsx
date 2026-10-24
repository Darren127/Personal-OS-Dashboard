"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { TaskForm, type TaskDefaults } from "@/components/tasks/task-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LinkOptions, TaskWithLinks } from "@/lib/server/tasks";

type DialogState =
  | { mode: "closed" }
  | { mode: "create"; defaults?: TaskDefaults }
  | { mode: "edit"; task: TaskWithLinks };

type TaskContextValue = {
  today: string;
  timezone: string;
  openCreate: (defaults?: TaskDefaults) => void;
  openEdit: (task: TaskWithLinks) => void;
};

const TaskContext = createContext<TaskContextValue | null>(null);

export function useTaskDialog() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTaskDialog must be used inside <TaskDialogProvider>");
  return ctx;
}

/**
 * One shared create/edit dialog for every task on the page, so link options
 * are sent to the browser once rather than per task.
 */
export function TaskDialogProvider({
  options,
  today,
  timezone,
  children,
}: {
  options: LinkOptions;
  today: string;
  timezone: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<DialogState>({ mode: "closed" });
  const close = useCallback(() => setState({ mode: "closed" }), []);

  const value = useMemo<TaskContextValue>(
    () => ({
      today,
      timezone,
      openCreate: (defaults) => setState({ mode: "create", defaults }),
      openEdit: (task) => setState({ mode: "edit", task }),
    }),
    [today, timezone],
  );

  return (
    <TaskContext.Provider value={value}>
      {children}
      <Dialog open={state.mode !== "closed"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{state.mode === "edit" ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>
              Only the title is required. Link it to a project or goal if it serves one.
            </DialogDescription>
          </DialogHeader>
          {state.mode !== "closed" && (
            <TaskForm
              key={state.mode === "edit" ? state.task.id : "new"}
              task={state.mode === "edit" ? state.task : undefined}
              defaults={state.mode === "create" ? state.defaults : undefined}
              options={options}
              timezone={timezone}
              onDone={close}
              onCancel={close}
            />
          )}
        </DialogContent>
      </Dialog>
    </TaskContext.Provider>
  );
}
