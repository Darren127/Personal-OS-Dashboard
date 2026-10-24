import Link from "next/link";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Not found"
      description="This item doesn't exist or was deleted."
    >
      <Button asChild variant="outline">
        <Link href="/">Back to My Day</Link>
      </Button>
    </EmptyState>
  );
}
