import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";

/** Honest placeholder for a module that hasn't been built yet. */
export function ComingSoon({
  icon,
  title,
  description,
  phase,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  phase: number;
}) {
  return (
    <EmptyState icon={icon} title={title} description={description}>
      <Badge variant="secondary">Planned for Phase {phase}</Badge>
    </EmptyState>
  );
}
