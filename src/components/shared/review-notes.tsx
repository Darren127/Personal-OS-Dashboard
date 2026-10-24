"use client";

import { useRef } from "react";
import { Loader2 } from "lucide-react";

import { addReviewNote } from "@/app/actions/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";
import { formatRelativeDate } from "@/lib/dates";

type Note = { id: string; review_date: string; notes: string; progress_snapshot: number | null };

export function ReviewNotes({
  kind,
  parentId,
  notes,
  today,
}: {
  kind: "goal" | "project";
  parentId: string;
  notes: Note[];
  today: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { pending, onSubmit, fieldErrors: e } = useFormAction(addReviewNote.bind(null, kind, parentId), {
    onSuccess: () => formRef.current?.reset(),
  });

  return (
    <div className="space-y-4">
      <form ref={formRef} onSubmit={onSubmit} className="space-y-2" noValidate>
        <Textarea
          name="notes"
          rows={3}
          aria-label="New review note"
          placeholder="What's working? What isn't? What will you change?"
          aria-invalid={e.notes ? true : undefined}
        />
        {e.notes && <p className="text-xs text-destructive">{e.notes}</p>}
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Add review note
        </Button>
      </form>
      {notes.length > 0 && (
        <ol className="space-y-3 border-l pl-4">
          {notes.map((n) => (
            <li key={n.id} className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {formatRelativeDate(n.review_date, today)}
                {n.progress_snapshot !== null && ` · progress was ${n.progress_snapshot}%`}
              </p>
              <p className="text-sm whitespace-pre-wrap">{n.notes}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
