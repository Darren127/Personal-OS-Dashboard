import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { History } from "lucide-react";

import { ActionCard } from "@/components/companion/action-card";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/skeletons";
import { listActions } from "@/lib/server/companion";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Action log · AI Companion" };

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

async function ActionsContent({ searchParams }: { searchParams: PageProps<"/companion/actions">["searchParams"] }) {
  const { show } = await searchParams;
  const filter = show === "all" ? "all" : "pending";
  const actions = await listActions(filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter actions" className="flex gap-1 rounded-lg bg-muted p-1">
          {[{ v: "pending", l: "Waiting for approval" }, { v: "all", l: "Everything" }].map((f) => (
            <Link
              key={f.v}
              href={f.v === "pending" ? "/companion/actions" : "/companion/actions?show=all"}
              aria-current={filter === f.v ? "page" : undefined}
              className={cn("rounded-md px-3 py-1 text-sm", filter === f.v ? "bg-card font-medium shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {f.l}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground">Every change the AI proposes or makes is recorded here and can&apos;t be edited or deleted.</p>
      </div>

      {actions.length === 0 ? (
        <EmptyState
          icon={History}
          title={filter === "pending" ? "Nothing waiting for approval" : "No AI actions yet"}
          description={filter === "pending" ? "When the AI proposes a change, it appears here and in the conversation." : "Changes the AI proposes or makes will be listed here."}
        />
      ) : (
        <ul className="space-y-3">
          {actions.map((a) => (
            <li key={a.id} className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {when.format(new Date(a.created_at))}
                {a.conversation_id && (
                  <> · <Link href={`/companion?c=${a.conversation_id}`} className="hover:text-foreground hover:underline">{a.conversation?.title ?? "Conversation"}</Link></>
                )}
              </p>
              <ActionCard
                id={a.id}
                toolName={a.tool_name}
                summary={a.summary ?? a.tool_name}
                status={a.status}
                risk={a.risk_level}
                error={a.error}
                before={a.before_state}
                result={a.result}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ActionsPage({ searchParams }: PageProps<"/companion/actions">) {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <ActionsContent searchParams={searchParams} />
    </Suspense>
  );
}
