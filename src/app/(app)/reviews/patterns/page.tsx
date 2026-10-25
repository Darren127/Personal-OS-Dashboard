import type { Metadata } from "next";
import { Suspense } from "react";
import { Sparkle } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { FindingsList } from "@/components/findings-list";
import { ListSkeleton } from "@/components/skeletons";
import { getFindings } from "@/lib/server/findings";
import { getPreferences, getToday } from "@/lib/server/preferences";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Patterns" };

async function Patterns() {
  const { supabase } = await requireUser();
  const [today, prefs] = await Promise.all([getToday(), getPreferences()]);
  const { findings, hiddenCount } = await getFindings(supabase, today, prefs);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Computed directly from your tasks, plans, and reviews — not AI guesses. Each one shows the evidence behind it.
        {hiddenCount > 0 && ` ${hiddenCount} hidden.`}
      </p>
      {findings.length ? (
        <FindingsList findings={findings} />
      ) : (
        <EmptyState
          icon={Sparkle}
          title="Nothing worth flagging right now"
          description="No overloaded day, long-overdue work, repeatedly postponed tasks, stalled goals, or old blockers. Patterns appear here as your history builds up."
        />
      )}
    </div>
  );
}

export default function PatternsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <Patterns />
    </Suspense>
  );
}
