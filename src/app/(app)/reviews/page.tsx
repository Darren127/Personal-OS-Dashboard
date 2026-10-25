import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NotebookPen, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ListSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatLongDate } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reviews" };

async function ReviewHistory() {
  const { supabase } = await requireUser();
  const [reviews, plans] = await Promise.all([
    supabase.from("daily_reviews").select("*").order("review_date", { ascending: false }).limit(60),
    supabase.from("daily_plans").select("plan_date, items:daily_plan_items(outcome, task_id)")
      .order("plan_date", { ascending: false }).limit(60),
  ]);
  if (reviews.error) throw new Error(`Failed to load reviews: ${reviews.error.message}`);
  if (plans.error) throw new Error(`Failed to load plans: ${plans.error.message}`);

  // Planned-task outcomes per day, recorded when the review was saved.
  const outcomes = new Map<string, Record<string, number>>();
  for (const plan of plans.data) {
    const counts: Record<string, number> = {};
    for (const i of plan.items) if (i.task_id && i.outcome) counts[i.outcome] = (counts[i.outcome] ?? 0) + 1;
    outcomes.set(plan.plan_date, counts);
  }

  if (reviews.data.length === 0) {
    return (
      <EmptyState
        icon={NotebookPen}
        title="No reviews yet"
        description="Close your day with the end-of-day review on My Day. Reviews build the history your AI Companion will learn from."
      >
        <Link href="/" className="text-sm font-medium text-primary hover:underline">Go to My Day</Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.data.map((r) => {
        const o = outcomes.get(r.review_date) ?? {};
        return (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>{formatLongDate(r.review_date)}</CardTitle>
              <CardDescription className="flex flex-wrap gap-2">
                {r.energy && <span>Energy {r.energy}/5</span>}
                {r.mood && <span>Mood {r.mood}/5</span>}
              </CardDescription>
              {Object.keys(o).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {o.done && <Badge variant="success">{o.done} done</Badge>}
                  {o.partial && <Badge variant="secondary">{o.partial} partial</Badge>}
                  {o.moved && <Badge variant="warning">{o.moved} moved</Badge>}
                  {o.skipped && <Badge variant="destructive">{o.skipped} skipped</Badge>}
                </div>
              )}
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {([["Wins", r.wins], ["Challenges", r.challenges], ["Lessons", r.lessons], ["Tomorrow's focus", r.tomorrow_focus]] as const)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
                      <dd className="whitespace-pre-wrap">{v}</dd>
                    </div>
                  ))}
              </dl>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <>
      <PageHeader
        title="Reviews"
        description="Your daily reviews and how each planned day actually went."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/companion?prompt=weekly"><Sparkles /> Weekly review</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/companion?prompt=monthly"><Sparkles /> Monthly review</Link>
            </Button>
          </div>
        }
      />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <ReviewHistory />
      </Suspense>
    </>
  );
}
