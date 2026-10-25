import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Suspense } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  FolderKanban,
  ListChecks,
  Milestone,
  NotebookPen,
  Star,
  Target,
} from "lucide-react";

import { FindingsList } from "@/components/findings-list";
import { DailyNotes, DailyReview } from "@/components/my-day/day-forms";
import { DueTodayList, OverdueList, Priorities } from "@/components/my-day/my-day-lists";
import { Schedule } from "@/components/my-day/schedule";
import { Skeleton } from "@/components/skeletons";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskDialogProvider } from "@/components/tasks/task-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatLongDate, formatMinutes, formatRelativeDate, hourIn } from "@/lib/dates";
import { getFindings } from "@/lib/server/findings";
import { getMyDay, type Deadline } from "@/lib/server/my-day";
import { getPreferences, getToday } from "@/lib/server/preferences";
import { getLinkOptions } from "@/lib/server/tasks";
import { requireUser } from "@/lib/supabase/server";

function Section({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const DEADLINE_ICON: Record<Deadline["kind"], React.ComponentType<{ className?: string }>> = {
  task: ListChecks,
  project_milestone: Milestone,
  goal_milestone: Target,
  project: FolderKanban,
};

async function MyDayContent() {
  const [today, prefs, options] = await Promise.all([getToday(), getPreferences(), getLinkOptions()]);
  const { supabase } = await requireUser();
  const [day, { findings }] = await Promise.all([getMyDay(today), getFindings(supabase, today, prefs)]);
  const hour = hourIn(prefs.timezone);
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const pct = day.progress.total ? Math.round((100 * day.progress.done) / day.progress.total) : null;
  const { estimatedMinutes, unestimated, workdayMinutes, blockedMinutes } = day.capacity;
  const available = Math.max(0, workdayMinutes - blockedMinutes);
  const overloaded = estimatedMinutes > available;

  return (
    <TaskDialogProvider options={options} today={today} timezone={prefs.timezone}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{formatLongDate(today)}</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting}
              {prefs.displayName ? `, ${prefs.displayName}` : ""}.
            </h1>
            {day.plan?.intention && <p className="text-sm text-muted-foreground">Intention: {day.plan.intention}</p>}
            <Link
              href="/companion?prompt=plan"
              className="inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-primary hover:underline"
            >
              <Sparkles className="size-4" /> Plan my day with the AI Companion
            </Link>
          </div>
          <div className="w-full max-w-64 space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">Today&apos;s progress</span>
              <span className="text-muted-foreground tabular-nums">
                {day.progress.total ? `${day.progress.done} of ${day.progress.total} done` : "Nothing planned yet"}
              </span>
            </div>
            <Progress value={pct} label="Today's task progress" />
          </div>
        </div>

        <QuickAdd dueTodayDefault placeholder="Add a task for today…" />

        {findings.length > 0 && (
          <section aria-labelledby="worth-a-look" className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="worth-a-look" className="text-sm font-semibold">Worth a look</h2>
              {findings.length > 3 && (
                <Link href="/reviews/patterns" className="text-xs text-primary hover:underline">
                  See all {findings.length}
                </Link>
              )}
            </div>
            <FindingsList findings={findings.slice(0, 3)} />
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 space-y-6 lg:col-span-3">
            <Section icon={Star} title="Top three priorities" description="If only these get done, today was a good day.">
              <Priorities priorities={day.priorities} candidates={day.candidates} />
            </Section>

            <Section icon={ListChecks} title={`Due today${day.dueToday.length ? ` · ${day.dueToday.length}` : ""}`}>
              {day.dueToday.length ? (
                <DueTodayList tasks={day.dueToday} prioritizedIds={day.priorities.map((p) => p.task.id)} />
              ) : (
                <p className="text-sm text-muted-foreground">Nothing is due today.</p>
              )}
            </Section>

            {day.overdue.length > 0 && (
              <Section
                icon={AlertTriangle}
                title={<span className="text-destructive">Overdue · {day.overdue.length}</span>}
                description="Decide for each: do it today, give it a realistic new date, or cancel it."
              >
                <OverdueList tasks={day.overdue} />
              </Section>
            )}
          </div>

          <div className="min-w-0 space-y-6 lg:col-span-2">
            <Section icon={CalendarClock} title="Schedule">
              {(estimatedMinutes > 0 || unestimated > 0) && (
                <p
                  className={
                    overloaded
                      ? "mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
                      : "mb-3 text-xs text-muted-foreground"
                  }
                >
                  {overloaded
                    ? `Today's open tasks need about ${formatMinutes(estimatedMinutes)}, but you have about ${formatMinutes(available)} of working time left after fixed blocks. Something has to move.`
                    : `About ${formatMinutes(estimatedMinutes)} of estimated work against ${formatMinutes(available)} available.`}
                  {unestimated > 0 && ` ${unestimated} task${unestimated === 1 ? " has" : "s have"} no estimate.`}
                </p>
              )}
              <Schedule blocks={day.blocks} tasks={day.allOpen} />
            </Section>

            <Section icon={CalendarRange} title="Upcoming deadlines" description="Next 14 days">
              {day.deadlines.length ? (
                <ul className="space-y-2">
                  {day.deadlines.slice(0, 8).map((d) => {
                    const Icon = DEADLINE_ICON[d.kind];
                    return (
                      <li key={`${d.kind}-${d.id}`} className="flex items-start gap-2 text-sm">
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <Link href={d.href} className="min-w-0 flex-1 hover:underline">
                          <span className="block truncate">{d.title}</span>
                          {d.context && <span className="block truncate text-xs text-muted-foreground">{d.context}</span>}
                        </Link>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeDate(d.date, today)}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No deadlines in the next two weeks.</p>
              )}
            </Section>

            <Section icon={NotebookPen} title="Daily notes">
              <DailyNotes intention={day.plan?.intention ?? ""} notes={day.plan?.notes ?? ""} />
            </Section>

            <Section
              icon={CheckCircle2}
              title="End-of-day review"
              description={day.review ? "Saved for today." : "Two minutes to close the day properly."}
            >
              <DailyReview review={day.review} progress={day.progress} />
            </Section>
          </div>
        </div>
      </div>
    </TaskDialogProvider>
  );
}

function MyDaySkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your day">
      <Skeleton className="h-16 w-72" />
      <Skeleton className="h-9 w-full" />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 space-y-6 lg:col-span-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function MyDayPage() {
  return (
    <Suspense fallback={<MyDaySkeleton />}>
      <MyDayContent />
    </Suspense>
  );
}
