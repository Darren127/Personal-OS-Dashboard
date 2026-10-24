"use client";

import { useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

import { addTimeBlock, removeTimeBlock } from "@/app/actions/my-day";
import { errorProps } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { runAction, useFormAction } from "@/hooks/use-form-action";
import { formatMinutes, formatTime, timeToMinutes } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Block = {
  itemId: string;
  start: string;
  end: string;
  title: string;
  task: { id: string; status: string } | null;
};

/** Find blocks that overlap the one before them (double-booking). */
function overlaps(blocks: Block[]) {
  const ids = new Set<string>();
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].start < blocks[i - 1].end) {
      ids.add(blocks[i].itemId);
      ids.add(blocks[i - 1].itemId);
    }
  }
  return ids;
}

export function Schedule({
  blocks,
  tasks,
}: {
  blocks: Block[];
  tasks: { id: string; title: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const [taskId, setTaskId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, onSubmit, fieldErrors: e } = useFormAction(addTimeBlock, {
    onSuccess: () => {
      formRef.current?.reset();
      setTaskId("");
      setAdding(false);
    },
  });
  const clashing = overlaps(blocks);

  return (
    <div className="space-y-3">
      {blocks.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          No time blocks yet. Blocking time for your top priorities makes them far more likely to happen.
        </p>
      )}

      {blocks.length > 0 && (
        <ol className="space-y-1.5">
          {blocks.map((b) => (
            <li
              key={b.itemId}
              className={cn(
                "group flex items-center gap-3 rounded-lg border-l-2 bg-muted/50 py-1.5 pr-1 pl-3",
                b.task ? "border-primary" : "border-muted-foreground/40",
                clashing.has(b.itemId) && "border-destructive",
              )}
            >
              <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {formatTime(b.start)}–{formatTime(b.end)}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  b.task?.status === "done" && "text-muted-foreground line-through",
                )}
              >
                {b.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatMinutes(timeToMinutes(b.end) - timeToMinutes(b.start))}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-60 group-hover:opacity-100"
                aria-label={`Remove time block "${b.title}"`}
                onClick={() => runAction(removeTimeBlock(b.itemId))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      )}
      {clashing.size > 0 && (
        <p className="text-xs text-destructive">Some blocks overlap — you can&apos;t do both at once.</p>
      )}

      {adding ? (
        <form ref={formRef} onSubmit={onSubmit} className="space-y-2 rounded-lg border p-3" noValidate>
          <NativeSelect
            name="task_id"
            aria-label="Task for this block"
            value={taskId}
            onChange={(ev) => setTaskId(ev.target.value)}
          >
            <option value="">Not a task (e.g. lunch, meeting)</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </NativeSelect>
          {!taskId && (
            <Input name="title" placeholder="Block name" aria-label="Block name" maxLength={200} {...errorProps("block-title", e.title)} />
          )}
          {e.title && <p id="block-title-error" className="text-xs text-destructive">{e.title}</p>}
          <div className="flex items-center gap-2">
            <Input name="start_time" type="time" aria-label="Start time" required defaultValue="09:00" />
            <span className="text-muted-foreground">–</span>
            <Input name="end_time" type="time" aria-label="End time" required defaultValue="10:00" {...errorProps("block-end", e.end_time)} />
          </div>
          {e.end_time && <p id="block-end-error" className="text-xs text-destructive">{e.end_time}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Add block
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus /> Add time block
        </Button>
      )}
    </div>
  );
}
