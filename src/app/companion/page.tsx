import type { Metadata } from "next";
import { BotMessageSquare } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "AI Companion" };

export default function CompanionPage() {
  return (
    <>
      <PageHeader
        title="AI Companion"
        description="An honest planning partner that works from your real goals, tasks, and reviews."
      />
      <ComingSoon
        icon={BotMessageSquare}
        title="Companion not set up"
        description="Requires a Claude API key (billed separately from a Claude Pro subscription) and the database from Phase 2."
        phase={3}
      />
    </>
  );
}
