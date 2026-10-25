import type { Metadata } from "next";
import { Suspense } from "react";

import { MemoryManager } from "@/components/companion/memory-manager";
import { ListSkeleton } from "@/components/skeletons";
import { listMemories } from "@/lib/server/companion";

export const metadata: Metadata = { title: "Memory · AI Companion" };

async function MemoryContent() {
  return <MemoryManager memories={await listMemories()} />;
}

export default function MemoryPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <MemoryContent />
    </Suspense>
  );
}
