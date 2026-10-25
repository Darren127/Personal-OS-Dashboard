"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, ChevronDown, CircleAlert, Clock, Loader2, Search, ShieldAlert, X } from "lucide-react";

import { approveAction, rejectAction } from "@/app/actions/companion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { runAction } from "@/hooks/use-form-action";
import { cn } from "@/lib/utils";

export const READ_TOOL_LABELS: Record<string, string> = {
  search_tasks: "Searched your tasks",
  get_goal_details: "Read a goal",
  get_project_details: "Read a project",
  get_reviews: "Read your reviews",
  get_behavior_insights: "Analysed your patterns",
  search_memories: "Searched memories",
  search_past_conversations: "Searched past conversations",
};

/** Small label for a lookup the AI did (no side effects). */
export function ToolChip({ name, status }: { name: string; status?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {status === "failed" || status === "invalid" ? <CircleAlert className="size-3 text-destructive" /> : <Search className="size-3" />}
      {READ_TOOL_LABELS[name] ?? name.replace(/_/g, " ")}
      {(status === "failed" || status === "invalid") && " (failed)"}
    </span>
  );
}

type Status = "proposed" | "approved" | "rejected" | "executed" | "failed" | "skipped" | "invalid";

const STATUS: Record<Status, { label: string; variant: "warning" | "success" | "secondary" | "destructive" | "outline" }> = {
  proposed: { label: "Needs your approval", variant: "warning" },
  approved: { label: "Running…", variant: "secondary" },
  executed: { label: "Done", variant: "success" },
  rejected: { label: "Rejected", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
  skipped: { label: "Not run", variant: "outline" },
  invalid: { label: "Invalid request", variant: "destructive" },
};

/** A change the AI made or wants to make. Proposed actions can be approved or rejected here. */
export function ActionCard({
  id,
  toolName,
  summary,
  status,
  risk,
  error,
  before,
  result,
  className,
}: {
  id?: string;
  toolName?: string;
  summary: string;
  status: Status;
  risk?: "low" | "high";
  error?: string | null;
  before?: unknown;
  result?: unknown;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [decided, setDecided] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const shown = decided ?? status;
  // A memory proposal "executed" means it was sent for review, not saved.
  const memoryProposal = toolName === "propose_memory" && shown === "executed";
  const s = memoryProposal ? { label: "Waiting in Memory", variant: "warning" as const } : STATUS[shown];
  const hasDetails = Boolean(before && Object.keys(before as object).length) || Boolean(result);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 text-sm",
        shown === "proposed" && "border-warning/50 bg-warning/5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        {shown === "proposed" ? (
          <Clock className="mt-0.5 size-4 shrink-0 text-warning" />
        ) : shown === "executed" ? (
          <Check className="mt-0.5 size-4 shrink-0 text-success" />
        ) : (
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        )}
        <p className="min-w-0 flex-1 font-medium break-words">{summary}</p>
        <Badge variant={s.variant}>{s.label}</Badge>
        {risk === "high" && shown === "proposed" && (
          <Badge variant="outline" className="gap-1">
            <ShieldAlert /> Major change
          </Badge>
        )}
      </div>
      {error && shown === "failed" && <p className="mt-1 pl-6 text-xs text-destructive">{error}</p>}
      {memoryProposal && (
        <p className="mt-1 pl-6 text-xs text-muted-foreground">
          Not remembered until you approve it on the{" "}
          <Link href="/companion/memory" className="text-primary hover:underline">Memory page</Link>.
        </p>
      )}

      {shown === "proposed" && id && (
        <div className="mt-3 flex gap-2 pl-6">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await runAction(approveAction(id));
                setDecided(r.ok ? "executed" : "failed");
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Check />} Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await runAction(rejectAction(id));
                if (r.ok) setDecided("rejected");
              })
            }
          >
            <X /> Reject
          </Button>
        </div>
      )}

      {hasDetails && shown !== "proposed" && !memoryProposal && (
        <div className="mt-2 pl-6">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={open}
          >
            <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} /> What changed
          </button>
          {open && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {Boolean(before && Object.keys(before as object).length) && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Before</p>
                  <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(before, null, 2)}</pre>
                </div>
              )}
              {Boolean(result) && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Result</p>
                  <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(result, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
