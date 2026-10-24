import type { Metadata } from "next";
import { ListTodo } from "lucide-react";

import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <>
      <PageHeader
        title="Tasks"
        description="Every task lives here once and appears wherever it is relevant."
      />
      <ComingSoon
        icon={ListTodo}
        title="No tasks yet"
        description="Create, filter, and sort tasks with status, priority, due dates, tags, and links to goals and projects."
        phase={2}
      />
    </>
  );
}
