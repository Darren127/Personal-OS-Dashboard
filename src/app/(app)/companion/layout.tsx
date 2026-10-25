import { Suspense } from "react";

import { CompanionTabs } from "@/components/companion/companion-tabs";
import { PageHeader } from "@/components/page-header";
import { countPendingReview } from "@/lib/server/companion";

async function TabsWithCounts() {
  return <CompanionTabs counts={await countPendingReview()} />;
}

export default function CompanionLayout({ children }: LayoutProps<"/companion">) {
  return (
    <>
      <PageHeader
        title="AI Companion"
        description="An honest planning partner that works from your real goals, tasks, and reviews."
      />
      <div className="mb-6">
        <Suspense fallback={<CompanionTabs />}>
          <TabsWithCounts />
        </Suspense>
      </div>
      {children}
    </>
  );
}
