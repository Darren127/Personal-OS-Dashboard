import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Bot, ChevronLeft, ChevronRight } from "lucide-react";

import { Markdown } from "@/components/companion/markdown";
import { WeeklyReviewForm } from "@/components/reviews/weekly-form";
import { Skeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays, formatRelativeDate, formatWeekRange, weekStartOf } from "@/lib/dates";
import { getPreferences, getToday } from "@/lib/server/preferences";
import { getWeek, resolveWeek } from "@/lib/server/weekly";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Weekly review" };

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

async function Week({ searchParams }: { searchParams: PageProps<"/reviews/weekly">["searchParams"] }) {
  const { week } = await searchParams;
  const { supabase } = await requireUser();
  const [today, prefs] = await Promise.all([getToday(), getPreferences()]);
  const weekStart = resolveWeek(week, today, prefs.weekStartsOn);
  const thisWeek = weekStartOf(today, prefs.weekStartsOn);
  const isFuture = weekStart > today;
  const { stats, daily, saved, history } = await getWeek(supabase, weekStart, today, prefs.timezone);
  const outcomes = stats.daily_plans.planned_task_outcomes as Record<string, number>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label="Previous week">
          <Link href={`/reviews/weekly?week=${addDays(weekStart, -7)}`}><ChevronLeft /></Link>
        </Button>
        <h2 className="min-w-48 text-center font-semibold">
          {formatWeekRange(weekStart)}
          {weekStart === thisWeek && <span className="ml-2 text-xs font-normal text-muted-foreground">this week</span>}
        </h2>
        <Button asChild variant="outline" size="icon" aria-label="Next week">
          <Link href={`/reviews/weekly?week=${addDays(weekStart, 7)}`}><ChevronRight /></Link>
        </Button>
        {weekStart !== thisWeek && (
          <Button asChild variant="ghost" size="sm"><Link href="/reviews/weekly">This week</Link></Button>
        )}
      </div>

      {isFuture ? (
        <p className="text-sm text-muted-foreground">This week hasn&apos;t started yet.</p>
      ) : (
        <>
          <section aria-label="This week in numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Tasks completed" value={stats.tasks.completed} note={`${stats.tasks.created} created`} />
            <Stat label="Top priorities done" value={stats.daily_plans.top_priorities_done === "no reviewed priorities" ? "—" : stats.daily_plans.top_priorities_done} />
            <Stat label="Days planned / reviewed" value={`${stats.daily_plans.days_with_a_plan} / ${stats.daily_plans.days_closed_with_review}`} />
            <Stat
              label="Energy · mood"
              value={stats.reviews.average_energy === null ? "—" : `${stats.reviews.average_energy} · ${stats.reviews.average_mood ?? "—"}`}
              note={stats.reviews.count ? "average out of 5" : "no daily reviews"}
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>What the data says</CardTitle>
                <CardDescription>Computed from your tasks and plans.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {Object.keys(outcomes).length > 0 && (
                  <p>
                    Planned tasks: {Object.entries(outcomes).map(([k, v]) => `${v} ${k}`).join(", ")}.
                  </p>
                )}
                {"average_actual_to_estimate_ratio" in stats.estimates && (
                  <p>
                    Tasks took {stats.estimates.average_actual_to_estimate_ratio}× their estimate on average
                    ({stats.estimates.tasks_measured} measured).
                  </p>
                )}
                {stats.goals.tasks_completed_per_goal.length > 0 && (
                  <p>Progress by goal: {stats.goals.tasks_completed_per_goal.map((g) => `${g.goal} (${g.tasks_completed})`).join(", ")}.</p>
                )}
                {stats.goals.with_no_completed_tasks_or_milestones_in_window.length > 0 && (
                  <p>No progress this week: {stats.goals.with_no_completed_tasks_or_milestones_in_window.map((g) => g.title).join(", ")}.</p>
                )}
                {stats.tasks.completed_without_goal > 0 && stats.tasks.completed > 0 && (
                  <p className="text-muted-foreground">
                    {stats.tasks.completed_without_goal} of {stats.tasks.completed} completed tasks weren&apos;t linked to any goal.
                  </p>
                )}
                {stats.repeatedly_rescheduled_open_tasks.length > 0 && (
                  <p>Still being pushed back: {stats.repeatedly_rescheduled_open_tasks.slice(0, 3).map((t) => `"${t.title}" (${t.times_pushed_later}×)`).join(", ")}.</p>
                )}
                {stats.tasks.completed === 0 && Object.keys(outcomes).length === 0 && (
                  <p className="text-muted-foreground">Not much recorded this week yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Daily reviews this week</CardTitle>
              </CardHeader>
              <CardContent>
                {daily.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No daily reviews this week.</p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {daily.map((d) => (
                      <li key={d.review_date}>
                        <p className="text-xs font-medium text-muted-foreground">{formatRelativeDate(d.review_date, today)}</p>
                        {d.wins && <p><span className="text-muted-foreground">Wins:</span> {d.wins}</p>}
                        {d.challenges && <p><span className="text-muted-foreground">Challenges:</span> {d.challenges}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {saved?.ai_summary && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bot className="size-4 text-muted-foreground" /> AI Companion&apos;s summary</CardTitle>
              </CardHeader>
              <CardContent><Markdown>{saved.ai_summary}</Markdown></CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Your reflection</CardTitle>
              <CardDescription>
                {saved ? "Saved. Edit any time." : "A few honest sentences. Or ask the AI Companion to go through the week with you."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WeeklyReviewForm key={weekStart} weekStart={weekStart} saved={saved} />
            </CardContent>
          </Card>
        </>
      )}

      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Past weekly reviews</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {history.map((h) => (
              <li key={h.week_start}>
                <Link href={`/reviews/weekly?week=${h.week_start}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm hover:bg-muted/60">
                  <span className="font-medium">{formatWeekRange(h.week_start)}</span>
                  {h.rating && <span className="text-muted-foreground">rated {h.rating}/5</span>}
                  {h.next_week_focus && <span className="min-w-0 flex-1 truncate text-muted-foreground">Focus: {h.next_week_focus}</span>}
                  {h.ai_summary && <Bot className="size-3.5 text-muted-foreground" aria-label="Has an AI summary" />}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function WeeklyReviewPage({ searchParams }: PageProps<"/reviews/weekly">) {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-9 w-72" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>}>
      <Week searchParams={searchParams} />
    </Suspense>
  );
}
