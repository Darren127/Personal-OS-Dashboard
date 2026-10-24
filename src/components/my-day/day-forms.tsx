"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";

import { saveDailyNotes, saveDailyReview } from "@/app/actions/my-day";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";

export function DailyNotes({ intention, notes }: { intention: string; notes: string }) {
  const { pending, onSubmit } = useFormAction(saveDailyNotes);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <FormField id="day-intention" label="Today's intention">
        <Input
          id="day-intention"
          name="intention"
          defaultValue={intention}
          maxLength={500}
          placeholder="e.g. Protect the morning for deep work"
        />
      </FormField>
      <FormField id="day-notes" label="Notes">
        <Textarea id="day-notes" name="notes" defaultValue={notes} rows={4} placeholder="Thoughts, ideas, things to remember…" />
      </FormField>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Save notes
      </Button>
    </form>
  );
}

type Review = {
  wins: string | null;
  challenges: string | null;
  lessons: string | null;
  tomorrow_focus: string | null;
  energy: number | null;
  mood: number | null;
};

const SCALE = ["", "1 · Very low", "2 · Low", "3 · OK", "4 · Good", "5 · Great"];

export function DailyReview({
  review,
  progress,
}: {
  review: Review | null;
  progress: { done: number; total: number };
}) {
  const [editing, setEditing] = useState(!review);
  const { pending, onSubmit } = useFormAction(saveDailyReview, { onSuccess: () => setEditing(false) });

  if (review && !editing) {
    const rows: [string, string | null][] = [
      ["Wins", review.wins],
      ["Challenges", review.challenges],
      ["Lessons", review.lessons],
      ["Tomorrow's focus", review.tomorrow_focus],
    ];
    return (
      <div className="space-y-3 text-sm">
        <dl className="space-y-2">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
                <dd className="whitespace-pre-wrap">{v}</dd>
              </div>
            ))}
        </dl>
        {(review.energy || review.mood) && (
          <p className="text-xs text-muted-foreground">
            {review.energy && `Energy ${review.energy}/5`}
            {review.energy && review.mood && " · "}
            {review.mood && `Mood ${review.mood}/5`}
          </p>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil /> Edit review
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {progress.total > 0
          ? `You completed ${progress.done} of ${progress.total} tasks planned for today. Be honest about what got in the way — that's what makes tomorrow better.`
          : "A few honest sentences are enough."}
      </p>
      <FormField id="rev-wins" label="What went well?">
        <Textarea id="rev-wins" name="wins" rows={2} defaultValue={review?.wins ?? ""} />
      </FormField>
      <FormField id="rev-challenges" label="What got in the way?">
        <Textarea id="rev-challenges" name="challenges" rows={2} defaultValue={review?.challenges ?? ""} />
      </FormField>
      <FormField id="rev-lessons" label="What will you do differently?">
        <Textarea id="rev-lessons" name="lessons" rows={2} defaultValue={review?.lessons ?? ""} />
      </FormField>
      <FormField id="rev-tomorrow" label="Tomorrow's most important thing">
        <Input id="rev-tomorrow" name="tomorrow_focus" defaultValue={review?.tomorrow_focus ?? ""} maxLength={2000} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="rev-energy" label="Energy">
          <NativeSelect id="rev-energy" name="energy" defaultValue={review?.energy ?? ""}>
            {SCALE.map((s, i) => (
              <option key={i} value={i || ""}>
                {s || "—"}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="rev-mood" label="Mood">
          <NativeSelect id="rev-mood" name="mood" defaultValue={review?.mood ?? ""}>
            {SCALE.map((s, i) => (
              <option key={i} value={i || ""}>
                {s || "—"}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save review
        </Button>
        {review && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
