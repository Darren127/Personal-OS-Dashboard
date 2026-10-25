import Link from "next/link";
import { Mail, Sparkles } from "lucide-react";

import {
  ConnectGmailButton,
  EmailLists,
  EmailReturnNotice,
  ReconnectNotice,
  RefreshButton,
  SyncErrorNotice,
} from "@/components/email/email-intelligence-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEmailIntelligence } from "@/lib/server/gmail/service";
import type { Db } from "@/lib/supabase/server";

function Stat({ label, value, tone }: { label: string; value: number; tone?: "alert" }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className={tone === "alert" && value > 0 ? "text-xl font-semibold tabular-nums text-destructive" : "text-xl font-semibold tabular-nums"}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Homepage "Email Intelligence" card: Gmail triage with Claude. */
export async function EmailIntelligenceCard({ supabase, timezone }: { supabase: Db; timezone: string }) {
  const data = await getEmailIntelligence(supabase);
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <Card data-testid="email-intelligence">
      <EmailReturnNotice />
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" /> Email Intelligence
            </CardTitle>
            <CardDescription className="[overflow-wrap:anywhere]">
              {data.state === "connected" || data.state === "needs_reconnect"
                ? `${data.account} · ${data.lastSyncAt ? `last synced ${fmt(data.lastSyncAt)}` : "not synced yet"}`
                : "Read-only Gmail triage. Personal OS never sends, deletes, archives or changes email."}
            </CardDescription>
          </div>
          {data.state === "connected" && <RefreshButton />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.state === "not_configured" && (
          <div className="space-y-2 text-sm">
            <p>Gmail isn&apos;t set up on the server yet.</p>
            {data.missing.length > 0 && (
              <p className="text-muted-foreground [overflow-wrap:anywhere]">Missing settings: {data.missing.join(", ")}.</p>
            )}
            {data.problems.map((p) => (
              <p key={p} className="text-destructive [overflow-wrap:anywhere]">{p}</p>
            ))}
            <p className="text-muted-foreground">
              See the Gmail section in <Link href="/settings" className="text-primary hover:underline">Settings</Link> and
              docs/GMAIL_SETUP.md.
            </p>
          </div>
        )}

        {data.state === "not_connected" && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Connect Gmail to see which recent emails matter, which need a reply, and any deadlines they mention. Access is read-only.
            </p>
            <ConnectGmailButton />
          </div>
        )}

        {(data.state === "connected" || data.state === "needs_reconnect") && (() => {
          const analysed = data.emails.filter((e) => e.analysis);
          const important = analysed.filter((e) => e.analysis!.importance === "critical" || e.analysis!.importance === "high").length;
          const critical = analysed.filter((e) => e.analysis!.importance === "critical").length;
          const replies = analysed.filter((e) => e.analysis!.needs_reply).length;
          const actions = analysed.filter((e) => e.analysis!.action_required || e.analysis!.deadlines.length).length;
          const notAnalysed = data.emails.length - analysed.length;
          return (
            <>
              {data.state === "needs_reconnect" && <ReconnectNotice message={data.lastError} />}
              {data.state === "connected" && data.lastError && <SyncErrorNotice message={data.lastError} />}

              {data.briefing && (
                <div className="rounded-lg bg-accent/40 p-3 text-sm">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Sparkles className="size-3.5" /> AI briefing{data.briefingAt && ` · ${fmt(data.briefingAt)}`}
                  </p>
                  <p className="whitespace-pre-line [overflow-wrap:anywhere]">{data.briefing}</p>
                </div>
              )}

              {data.emails.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label={critical ? `Important (${critical} critical)` : "Important"} value={important} tone="alert" />
                    <Stat label="Need a reply" value={replies} />
                    <Stat label="Actions & deadlines" value={actions} />
                    <Stat label="Unread" value={data.emails.filter((e) => e.isUnread).length} />
                  </div>
                  {notAnalysed > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {notAnalysed} {notAnalysed === 1 ? "email isn't" : "emails aren't"} analysed yet
                      {data.aiConfigured ? " — press Refresh." : " — add a Claude API key (ANTHROPIC_API_KEY) to analyse them."}
                    </p>
                  )}
                  <EmailLists emails={data.emails} account={data.account} timezone={timezone} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {data.lastSyncAt
                    ? `No email in your inbox from the last ${data.syncDays} days.`
                    : "Connected. Press Refresh to fetch your recent email."}
                </p>
              )}
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}
