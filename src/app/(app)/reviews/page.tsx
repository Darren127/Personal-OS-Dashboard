import type { Metadata } from "next";
import { NotebookPen } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Reviews" };

export default function ReviewsPage() {
  return (
    <>
      <PageHeader
        title="Reviews"
        description="Daily, weekly, and monthly reflections on what happened and what to change."
      />
      <ComingSoon
        icon={NotebookPen}
        title="No reviews yet"
        description="End-of-day reviews arrive with My Day; weekly reviews and plan-failure detection follow."
        phase={4}
      />
    </>
  );
}
