"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/companion", label: "Chat" },
  { href: "/companion/memory", label: "Memory", count: "memories" as const },
  { href: "/companion/actions", label: "Action log", count: "actions" as const },
];

function Tabs({ pathname, counts }: { pathname?: string; counts?: { actions: number; memories: number } }) {
  return (
    <nav aria-label="AI Companion sections" className="flex w-fit gap-1 rounded-lg bg-muted p-1">
      {TABS.map((t) => {
        const active = pathname === t.href;
        const n = t.count && counts ? counts[t.count] : 0;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors",
              active ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {n > 0 && (
              <span className="rounded-full bg-warning/20 px-1.5 text-[11px] font-semibold text-warning" aria-label={`${n} waiting for review`}>
                {n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function ActiveTabs({ counts }: { counts?: { actions: number; memories: number } }) {
  return <Tabs pathname={usePathname()} counts={counts} />;
}

export function CompanionTabs({ counts }: { counts?: { actions: number; memories: number } }) {
  return (
    <Suspense fallback={<Tabs counts={counts} />}>
      <ActiveTabs counts={counts} />
    </Suspense>
  );
}
