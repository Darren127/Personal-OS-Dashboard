"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL } from "@/lib/domain";
import type { LinkOptions, TaskFilters as Filters } from "@/lib/server/tasks";
import { cn } from "@/lib/utils";

/** Filters live in the URL, so a filtered view can be bookmarked or shared. */
export function TaskFilters({ filters, options }: { filters: Filters; options: LinkOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q ?? "");
  // Latest requested query string. Rapid changes build on this rather than on
  // `params`, which lags until the previous navigation finishes.
  const latest = useRef(params.toString());
  useEffect(() => {
    latest.current = params.toString();
  }, [params]);

  function update(key: string, value: string | undefined) {
    const next = new URLSearchParams(latest.current);
    if (value) next.set(key, value);
    else next.delete(key);
    latest.current = next.toString();
    startTransition(() => router.replace(`${pathname}?${latest.current}`, { scroll: false }));
  }

  // Debounce the search box.
  useEffect(() => {
    if ((filters.q ?? "") === q) return;
    const t = setTimeout(() => update("q", q.trim() || undefined), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active =
    filters.q || filters.status !== "open" || filters.priority || filters.project || filters.goal || filters.tag || filters.due !== "any";

  const select = (key: string, value: string | undefined, label: string, children: React.ReactNode) => (
    <NativeSelect
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => update(key, e.target.value || undefined)}
      className="h-8 w-auto min-w-0 text-xs"
    >
      {children}
    </NativeSelect>
  );

  return (
    <div className={cn("space-y-2 transition-opacity", pending && "opacity-60")}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search task titles…"
          aria-label="Search tasks"
          className="pl-9"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {select("status", filters.status === "open" ? undefined : filters.status, "Filter by status", (
          <>
            <option value="">Open tasks</option>
            <option value="all">All statuses</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </>
        ))}
        {select("due", filters.due === "any" ? undefined : filters.due, "Filter by due date", (
          <>
            <option value="">Any due date</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="week">Next 7 days</option>
            <option value="none">No due date</option>
          </>
        ))}
        {select("priority", filters.priority, "Filter by priority", (
          <>
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </>
        ))}
        {select("project", filters.project, "Filter by project", (
          <>
            <option value="">Any project</option>
            <option value="none">No project</option>
            {options.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </>
        ))}
        {select("goal", filters.goal, "Filter by goal", (
          <>
            <option value="">Any goal</option>
            <option value="none">No goal</option>
            {options.goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </>
        ))}
        {options.tags.length > 0 &&
          select("tag", filters.tag, "Filter by tag", (
            <>
              <option value="">Any tag</option>
              {options.tags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </>
          ))}
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        {select("sort", filters.sort === "due" ? undefined : filters.sort, "Sort tasks", (
          <>
            <option value="">Sort: Due date</option>
            <option value="priority">Sort: Priority</option>
            <option value="created">Sort: Newest</option>
            <option value="updated">Sort: Recently updated</option>
            <option value="title">Sort: Title</option>
          </>
        ))}
        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              latest.current = "";
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            <X /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}
