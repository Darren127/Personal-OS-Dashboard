import { AlertCircle, CalendarDays, Flag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { daysBetween, formatRelativeDate } from "@/lib/dates";
import { PRIORITY_LABEL, TASK_STATUS_LABEL, type Priority, type TaskStatus } from "@/lib/domain";
import { cn } from "@/lib/utils";

const PRIORITY_CLASS: Record<Priority, string> = {
  low: "text-muted-foreground",
  medium: "text-foreground/70",
  high: "text-warning",
  critical: "text-destructive",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "medium") return null; // the default; don't add noise
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", PRIORITY_CLASS[priority])}>
      <Flag className="size-3" />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const STATUS_VARIANT: Record<TaskStatus, "secondary" | "success" | "warning" | "outline" | "default"> = {
  inbox: "outline",
  next: "secondary",
  in_progress: "default",
  waiting: "warning",
  done: "success",
  cancelled: "outline",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{TASK_STATUS_LABEL[status]}</Badge>;
}

export function DueLabel({
  due,
  today,
  open,
}: {
  due: string;
  today: string;
  open: boolean;
}) {
  const diff = daysBetween(today, due);
  const overdue = open && diff < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        overdue ? "font-medium text-destructive" : diff === 0 && open ? "font-medium text-primary" : "text-muted-foreground",
      )}
    >
      {overdue ? <AlertCircle className="size-3" /> : <CalendarDays className="size-3" />}
      {formatRelativeDate(due, today)}
    </span>
  );
}
