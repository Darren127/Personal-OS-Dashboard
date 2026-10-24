import type { Metadata } from "next";
import { Target } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Life Goals" };

export default function GoalsPage() {
  return (
    <>
      <PageHeader
        title="Life Goals"
        description="Long-term, annual, quarterly, and short-term goals across every area of life."
      />
      <ComingSoon
        icon={Target}
        title="No goals yet"
        description="Define why a goal matters, how success is measured, and break it into milestones and tasks."
        phase={2}
      />
    </>
  );
}
