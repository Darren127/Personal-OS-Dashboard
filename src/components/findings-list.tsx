"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, ArrowRight, CalendarArrowUp, CircleAlert, Info, Loader2, MoreHorizontal, Sparkles, Trash2 } from "lucide-react";

import { setTaskStatus } from "@/app/actions/tasks";
import { dismissFinding, rescheduleTasks } from "@/app/actions/findings";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { runAction } from "@/hooks/use-form-action";
import type { Finding, FindingAction } from "@/lib/findings";
import { cn } from "@/lib/utils";

const STYLE = {
  alert: { icon: AlertTriangle, box: "border-destructive/40 bg-destructive/5", iconClass: "text-destructive" },
  warning: { icon: CircleAlert, box: "border-warning/40 bg-warning/5", iconClass: "text-warning" },
  info: { icon: Info, box: "", iconClass: "text-muted-foreground" },
};

function ActionButton({ action }: { action: FindingAction }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);

  switch (action.kind) {
    case "link":
      return (
        <Button asChild size="sm" variant="outline">
          <Link href={action.href}>{action.label} <ArrowRight /></Link>
        </Button>
      );
    case "ask_ai":
      return (
        <Button asChild size="sm" variant="outline">
          <Link href={`/companion?ask=${encodeURIComponent(action.prompt)}`}><Sparkles /> {action.label}</Link>
        </Button>
      );
    case "reschedule_tasks":
      return (
        <Button size="sm" disabled={pending} onClick={() => start(async () => { await runAction(rescheduleTasks(action.taskIds, action.dueDate)); })}>
          {pending ? <Loader2 className="animate-spin" /> : <CalendarArrowUp />} {action.label}
        </Button>
      );
    case "cancel_task":
      return (
        <>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            <Trash2 /> {action.label}
          </Button>
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title="Drop this task?"
            description="It will be marked Cancelled (not deleted), so the history stays. You can reopen it from Tasks."
            confirmLabel="Drop it"
            onConfirm={() => runAction(setTaskStatus(action.taskId, "cancelled"), "Task dropped.")}
          />
        </>
      );
  }
}

/** "Worth a look": patterns found in the user's data, with one-click responses. */
export function FindingsList({ findings }: { findings: Finding[] }) {
  return (
    <ul className="space-y-3">
      {findings.map((f) => {
        const s = STYLE[f.severity];
        const Icon = s.icon;
        return (
          <li key={f.key} className={cn("rounded-lg border p-3", s.box)}>
            <div className="flex items-start gap-3">
              <Icon className={cn("mt-0.5 size-4 shrink-0", s.iconClass)} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium break-words">{f.title}</p>
                <p className="text-sm text-muted-foreground">{f.evidence}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Hide "${f.title}"`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => runAction(dismissFinding(f.key, "day"))}>Hide until tomorrow</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runAction(dismissFinding(f.key, "week"))}>Hide for a week</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => runAction(dismissFinding(f.key, "forever"))}>Dismiss (until it changes)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {f.actions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 pl-7">
                {f.actions.map((a, i) => <ActionButton key={i} action={a} />)}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
