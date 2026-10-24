"use client";

import { Plus } from "lucide-react";

import type { TaskDefaults } from "@/components/tasks/task-form";
import { useTaskDialog } from "@/components/tasks/task-dialog";
import { Button } from "@/components/ui/button";

export function NewTaskButton({
  defaults,
  label = "New task",
  variant = "default",
}: {
  defaults?: TaskDefaults;
  label?: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const { openCreate } = useTaskDialog();
  return (
    <Button variant={variant} onClick={() => openCreate(defaults)}>
      <Plus /> {label}
    </Button>
  );
}
