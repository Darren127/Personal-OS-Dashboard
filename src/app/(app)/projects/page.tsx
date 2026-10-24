import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Objectives, milestones, blockers, and the tasks that move them forward."
      />
      <ComingSoon
        icon={FolderKanban}
        title="No projects yet"
        description="Track progress, upcoming milestones, overdue tasks, and the next recommended action for each project."
        phase={2}
      />
    </>
  );
}
