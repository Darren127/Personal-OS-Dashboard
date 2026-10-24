"use client";

import { format } from "date-fns";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Greeting and date in the viewer's own timezone. The server runs in UTC and
 * doesn't know where you are, so this renders in the browser.
 */
export function TodayGreeting({ name }: { name?: string }) {
  const now = useSyncExternalStore(
    subscribe,
    () => new Date().toDateString(),
    () => null,
  );

  if (!now) {
    return <div className="h-14 w-64 animate-pulse rounded-md bg-muted" />;
  }

  const date = new Date();
  const hour = date.getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">
        {format(date, "EEEE, d MMMM yyyy")}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Good {part}
        {name ? `, ${name}` : ""}.
      </h1>
    </div>
  );
}
