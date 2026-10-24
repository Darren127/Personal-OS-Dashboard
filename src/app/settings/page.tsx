import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getIntegrationStatus } from "@/lib/server/env";

export const metadata: Metadata = { title: "Settings" };

function StatusRow({ label, ok, hint }: { label: string; ok: boolean; hint: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
      ) : (
        <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{hint}</p>
      </div>
      <Badge variant={ok ? "success" : "secondary"}>
        {ok ? "Configured" : "Not set"}
      </Badge>
    </li>
  );
}

async function IntegrationStatus() {
  // Read environment at request time, not build time.
  await connection();
  const s = getIntegrationStatus();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {s.problems.length > 0 && (
        <Card className="border-destructive/40 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-destructive">Configuration problems</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm">
              {s.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Database (Supabase)</CardTitle>
          <CardDescription>Stores tasks, goals, projects, reviews, and memories.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            <StatusRow label="Project URL" ok={s.supabase.url} hint="NEXT_PUBLIC_SUPABASE_URL" />
            <StatusRow
              label="Publishable key"
              ok={s.supabase.publishableKey}
              hint="NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — limited by Row Level Security"
            />
            <StatusRow
              label="Secret key"
              ok={s.supabase.secretKey}
              hint="SUPABASE_SECRET_KEY — server only, never sent to the browser"
            />
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI (Claude API)</CardTitle>
          <CardDescription>
            Billed per use through the Anthropic Console — separate from a Claude Pro subscription.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            <StatusRow label="API key" ok={s.anthropic.apiKey} hint="ANTHROPIC_API_KEY — server only" />
            <StatusRow
              label="Model"
              ok={Boolean(s.anthropic.model)}
              hint={s.anthropic.model ?? "ANTHROPIC_MODEL — optional, a sensible default is used"}
            />
            <StatusRow
              label="Monthly budget"
              ok={s.anthropic.monthlyBudgetUsd !== null}
              hint={
                s.anthropic.monthlyBudgetUsd !== null
                  ? `US$${s.anthropic.monthlyBudgetUsd} per month`
                  : "AI_MONTHLY_BUDGET_USD — optional spending guard"
              }
            />
          </ul>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Reminders and scheduled reviews</CardTitle>
          <CardDescription>
            No scheduler or notification service is connected, so Personal OS cannot contact you on its own.
            Reviews can be run manually once the AI Companion is built.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Connection status for the services Personal OS depends on. Values are never shown."
      />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <IntegrationStatus />
      </Suspense>
    </>
  );
}
