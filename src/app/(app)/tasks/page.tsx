import type { Metadata } from "next";
import { Suspense } from "react";
import { ListTodo, SearchX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ListSkeleton } from "@/components/skeletons";
import { NewTaskButton } from "@/components/tasks/new-task-button";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskDialogProvider } from "@/components/tasks/task-dialog";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TaskList } from "@/components/tasks/task-item";
import { Card, CardContent } from "@/components/ui/card";
import { getPreferences, getToday } from "@/lib/server/preferences";
import { getLinkOptions, listTasks, taskFiltersSchema } from "@/lib/server/tasks";

export const metadata: Metadata = { title: "Tasks" };

async function TasksContent({ searchParams }: { searchParams: PageProps<"/tasks">["searchParams"] }) {
  const filters = taskFiltersSchema.parse(await searchParams);
  const [today, prefs, options] = await Promise.all([getToday(), getPreferences(), getLinkOptions()]);
  const tasks = await listTasks(filters, today);
  const filtered =
    filters.q || filters.status !== "open" || filters.priority || filters.project || filters.goal || filters.tag || filters.due !== "any";

  return (
    <TaskDialogProvider options={options} today={today} timezone={prefs.timezone}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <QuickAdd />
          </div>
          <NewTaskButton variant="outline" label="Detailed task" />
        </div>

        <Card>
          <CardContent className="space-y-4">
            <TaskFilters filters={filters} options={options} />
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {tasks.length === 500 ? "Showing the first 500 tasks" : `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}
            </p>
            {tasks.length > 0 ? (
              <TaskList tasks={tasks} />
            ) : filtered ? (
              <EmptyState
                icon={SearchX}
                title="No tasks match these filters"
                description="Try clearing a filter or searching for something else."
              />
            ) : (
              <EmptyState
                icon={ListTodo}
                title="No open tasks"
                description="Capture anything on your mind with the box above. You can organise it later."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </TaskDialogProvider>
  );
}

export default function TasksPage({ searchParams }: PageProps<"/tasks">) {
  return (
    <>
      <PageHeader
        title="Tasks"
        description="Every task lives here once and appears wherever it's relevant."
      />
      <Suspense fallback={<ListSkeleton rows={8} />}>
        <TasksContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
