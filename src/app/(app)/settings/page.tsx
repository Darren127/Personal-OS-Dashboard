import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckCircle2, CircleDashed } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { AutoExecuteToggle } from "@/components/ai-settings";
import { DisconnectGmailButton } from "@/components/email/disconnect-gmail";
import { ConnectGmailButton } from "@/components/email/email-intelligence-view";
import { PreferencesForm } from "@/components/preferences-form";
import { Skeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getIntegrationStatus } from "@/lib/server/env";
import { getAiConfig } from "@/lib/server/ai/config";
import { monthToDateCostUsd } from "@/lib/server/ai/engine";
import { getGmailConfig } from "@/lib/server/gmail/config";
import { getPreferences } from "@/lib/server/preferences";
import { requireUser } from "@/lib/supabase/server";

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
          <CardTitle>Gmail (Google OAuth)</CardTitle>
          <CardDescription>
            Read-only access to recent email for Email Intelligence. Set up in Google Cloud Console — see docs/GMAIL_SETUP.md.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="grid divide-y sm:grid-cols-2 sm:gap-x-6 sm:divide-y-0">
            <StatusRow label="OAuth client ID" ok={s.gmail.clientId} hint="GOOGLE_CLIENT_ID" />
            <StatusRow label="OAuth client secret" ok={s.gmail.clientSecret} hint="GOOGLE_CLIENT_SECRET — server only" />
            <StatusRow label="Redirect URI" ok={s.gmail.redirectUri} hint="GOOGLE_REDIRECT_URI — must end with /api/gmail/callback" />
            <StatusRow label="Token encryption key" ok={s.gmail.encryptionKey} hint="GOOGLE_TOKEN_ENCRYPTION_KEY — server only" />
          </ul>
          <Suspense fallback={<Skeleton className="h-9 w-48" />}>
            <GmailConnection />
          </Suspense>
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

async function GmailConnection() {
  const { supabase } = await requireUser();
  const cfg = getGmailConfig();
  if (!cfg.ok) return <p className="text-sm text-muted-foreground">Connect Gmail becomes available once all four settings above are set.</p>;
  const { data: conn } = await supabase.from("gmail_connections").select("google_email, status, connected_at").maybeSingle();
  if (!conn) return <ConnectGmailButton />;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="[overflow-wrap:anywhere]">
        Connected as <strong>{conn.google_email}</strong>
        {conn.status === "needs_reconnect" && <Badge variant="warning" className="ml-2">Needs reconnecting</Badge>}
      </span>
      {conn.status === "needs_reconnect" && <ConnectGmailButton label="Reconnect Gmail" />}
      <DisconnectGmailButton />
    </div>
  );
}

async function Preferences() {
  const prefs = await getPreferences();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>How Personal OS plans your day.</CardDescription>
      </CardHeader>
      <CardContent>
        <PreferencesForm
          displayName={prefs.displayName}
          timezone={prefs.timezone}
          workDayStart={prefs.workDayStart}
          workDayEnd={prefs.workDayEnd}
          weekStartsOn={prefs.weekStartsOn}
          timezones={Intl.supportedValuesOf("timeZone")}
        />
      </CardContent>
    </Card>
  );
}

async function AiSettings() {
  const { supabase } = await requireUser();
  const [prefs, spent] = await Promise.all([getPreferences(), monthToDateCostUsd(supabase)]);
  const config = getAiConfig();
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Companion</CardTitle>
        <CardDescription>What the AI may do on its own, and what it costs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <AutoExecuteToggle enabled={prefs.aiAutoExecuteLowRisk} />
        <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Model</dt>
            <dd className="font-mono text-xs">{config.model}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Thinking effort</dt>
            <dd>{config.effort}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Estimated spend this month</dt>
            <dd>
              US${spent.toFixed(2)}
              {config.monthlyBudgetUsd !== null && <span className="text-muted-foreground"> of US${config.monthlyBudgetUsd} budget</span>}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Spend is estimated from token counts and list prices; your Anthropic Console shows the actual bill.
          {config.monthlyBudgetUsd === null && " Set AI_MONTHLY_BUDGET_USD to stop the AI when a monthly limit is reached."}
        </p>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your preferences, and the status of the services Personal OS depends on."
      />
      <div className="mb-6">
        <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
          <Preferences />
        </Suspense>
      </div>
      <div className="mb-6">
        <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
          <AiSettings />
        </Suspense>
      </div>
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Connections (values are never shown)</h2>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <IntegrationStatus />
      </Suspense>
    </>
  );
}
