"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

export type SubNavItem = { href: string; label: string; count?: number };

function Tabs({ items, label, pathname }: { items: SubNavItem[]; label: string; pathname?: string }) {
  return (
    <nav aria-label={label} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
      {items.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors",
              active ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {Boolean(t.count) && (
              <span className="rounded-full bg-warning/20 px-1.5 text-[11px] font-semibold text-warning" aria-label={`${t.count} waiting for review`}>
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function ActiveTabs(props: { items: SubNavItem[]; label: string }) {
  return <Tabs {...props} pathname={usePathname()} />;
}

/** Section tabs with the current page highlighted. */
export function SubNav({ items, label }: { items: SubNavItem[]; label: string }) {
  return (
    <Suspense fallback={<Tabs items={items} label={label} />}>
      <ActiveTabs items={items} label={label} />
    </Suspense>
  );
}
