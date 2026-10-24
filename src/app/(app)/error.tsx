"use client";

import { AlertTriangle, RotateCw } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="This page couldn't load"
      description="Your data is safe. Try again — if it keeps happening, check that the database is running and configured (see the README), then check the server logs."
    >
      <Button variant="outline" onClick={reset}>
        <RotateCw /> Try again
      </Button>
    </EmptyState>
  );
}
