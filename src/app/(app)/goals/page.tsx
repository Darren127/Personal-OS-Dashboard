import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, Target } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { GoalDialogButton } from "@/components/goals/goal-form";
import { PageHeader } from "@/components/page-header";
import { ProgressSummary } from "@/components/progress-summary";
import { CardGridSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { daysBetween, formatRelativeDate } from "@/lib/dates";
import {
  GOAL_CATEGORIES,
  GOAL_CATEGORY_LABEL,
  GOAL_HORIZON_LABEL,
  GOAL_STATUS_LABEL,
} from "@/lib/domain";
import { goalStatusFilter, listGoals, type GoalWithProgress } from "@/lib/server/goals";
import { getToday } from "@/lib/server/preferences";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Life Goals" };

const FILTERS = [
  { value: "open", label: "Current" },
  { value: "achieved", label: "Achieved" },
  { value: "abandoned", label: "Abandoned" },
  { value: "all", label: "All" },
];

function GoalCard({ goal, today }: { goal: GoalWithProgress; today: string }) {
  const daysLeft = goal.target_date ? daysBetween(today, goal.target_date) : null;
  const late = daysLeft !== null && daysLeft < 0 && goal.status !== "achieved";
  return (
    <Link href={`/goals/${goal.id}`} className="group block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <Card className="h-full transition-colors group-hover:border-primary/40">
        <CardHeader>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{GOAL_HORIZON_LABEL[goal.horizon]}</Badge>
            {goal.status !== "active" && (
              <Badge variant={goal.status === "achieved" ? "success" : "outline"}>{GOAL_STATUS_LABEL[goal.status]}</Badge>
            )}
          </div>
          <CardTitle className="mt-2 leading-snug">{goal.title}</CardTitle>
          {goal.why_it_matters && <p className="line-clamp-2 text-sm text-muted-foreground">{goal.why_it_matters}</p>}
        </CardHeader>
        <CardContent className="mt-auto space-y-3">
          <ProgressSummary
            value={goal.progress.value}
            explanation={goal.progress.explanation}
            estimate={goal.progress.source === "manual"}
            label={`Progress for ${goal.title}`}
          />
          {goal.target_date && (
            <p className={cn("flex items-center gap-1 text-xs", late ? "text-destructive" : "text-muted-foreground")}>
              <CalendarDays className="size-3" />
              Target {formatRelativeDate(goal.target_date, today)}
              {late && " — past target date"}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

async function GoalsContent({ searchParams }: { searchParams: PageProps<"/goals">["searchParams"] }) {
  const { status: raw } = await searchParams;
  const status = goalStatusFilter(raw);
  const [allGoals, today] = await Promise.all([listGoals("all"), getToday()]);
  const goals = status === "all" ? allGoals : await listGoals(status);
  const options = allGoals.map((g) => ({ id: g.id, title: g.title }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter goals" className="flex gap-1 rounded-lg bg-muted p-1">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value === "open" ? "/goals" : `/goals?status=${f.value}`}
              aria-current={status === f.value ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                status === f.value ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <GoalDialogButton goals={options} />
      </div>

      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title={status === "open" ? "No current goals" : "Nothing here"}
          description="Start with one goal that genuinely matters to you this year. Fewer, clearer goals beat a long wishlist."
        />
      ) : (
        GOAL_CATEGORIES.filter((c) => goals.some((g) => g.category === c)).map((category) => (
          <section key={category} className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{GOAL_CATEGORY_LABEL[category]}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {goals.filter((g) => g.category === category).map((g) => <GoalCard key={g.id} goal={g} today={today} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

export default function GoalsPage({ searchParams }: PageProps<"/goals">) {
  return (
    <>
      <PageHeader
        title="Life Goals"
        description="Long-term, annual, quarterly, and short-term goals across every area of life."
      />
      <Suspense fallback={<CardGridSkeleton />}>
        <GoalsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
