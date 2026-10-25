"use client";

import { Loader2 } from "lucide-react";

import { saveWeeklyReview } from "@/app/actions/weekly";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";

type Saved = {
  wins: string | null;
  challenges: string | null;
  lessons: string | null;
  next_week_focus: string | null;
  rating: number | null;
} | null;

export function WeeklyReviewForm({ weekStart, saved }: { weekStart: string; saved: Saved }) {
  const { pending, onSubmit } = useFormAction(saveWeeklyReview.bind(null, weekStart));
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="wk-wins" label="What went well this week?">
          <Textarea id="wk-wins" name="wins" rows={3} defaultValue={saved?.wins ?? ""} />
        </FormField>
        <FormField id="wk-challenges" label="What didn't go to plan, and why?">
          <Textarea id="wk-challenges" name="challenges" rows={3} defaultValue={saved?.challenges ?? ""} />
        </FormField>
        <FormField id="wk-lessons" label="What will you do differently?">
          <Textarea id="wk-lessons" name="lessons" rows={3} defaultValue={saved?.lessons ?? ""} />
        </FormField>
        <div className="grid content-start gap-4">
          <FormField id="wk-focus" label="Next week's main focus">
            <Input id="wk-focus" name="next_week_focus" maxLength={2000} defaultValue={saved?.next_week_focus ?? ""} />
          </FormField>
          <FormField id="wk-rating" label="How did the week go overall?">
            <NativeSelect id="wk-rating" name="rating" defaultValue={saved?.rating ?? ""}>
              <option value="">—</option>
              <option value={1}>1 · Poor</option>
              <option value={2}>2 · Below par</option>
              <option value={3}>3 · OK</option>
              <option value={4}>4 · Good</option>
              <option value={5}>5 · Great</option>
            </NativeSelect>
          </FormField>
        </div>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {saved ? "Update weekly review" : "Save weekly review"}
        </Button>
      </div>
    </form>
  );
}
