"use client";

import { useOptimistic, useTransition } from "react";

import { setAutoExecute } from "@/app/actions/companion";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { runAction } from "@/hooks/use-form-action";

export function AutoExecuteToggle({ enabled }: { enabled: boolean }) {
  const [, start] = useTransition();
  const [value, setValue] = useOptimistic(enabled);
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id="ai-auto"
        className="mt-0.5"
        checked={value}
        onCheckedChange={(c) =>
          start(async () => {
            setValue(c === true);
            await runAction(setAutoExecute(c === true));
          })
        }
      />
      <div className="space-y-1">
        <Label htmlFor="ai-auto">Let the AI make low-risk changes without asking</Label>
        <p className="text-xs text-muted-foreground">
          Creating tasks, changing a task&apos;s status, priority or due date, linking tasks, adding milestones, and saving a first daily review.
          Deleting tasks, changing goals, and replacing your daily plan always need your approval. Everything is recorded in the action log.
        </p>
      </div>
    </div>
  );
}
