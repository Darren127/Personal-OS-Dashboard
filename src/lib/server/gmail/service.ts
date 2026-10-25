import "server-only";

import type { EmailAnalysis } from "@/lib/email/analysis";
import { getAiConfig } from "@/lib/server/ai/config";
import { claudeAnalyzer } from "@/lib/server/gmail/analyze";
import { getGmailConfig } from "@/lib/server/gmail/config";
import { gmailApi } from "@/lib/server/gmail/google";
import { syncGmail, type SyncResult } from "@/lib/server/gmail/sync";
import { getPreferences } from "@/lib/server/preferences";
import type { Db } from "@/lib/supabase/server";

export type EmailItem = {
  id: string;
  providerMessageId: string;
  fromName: string | null;
  fromEmail: string | null;
  subject: string;
  snippet: string;
  receivedAt: string;
  isUnread: boolean;
  taskId: string | null;
  analysis: EmailAnalysis | null;
};

export type EmailIntelligence =
  | { state: "not_configured"; missing: string[]; problems: string[] }
  | { state: "not_connected" }
  | {
      state: "connected" | "needs_reconnect";
      account: string;
      lastSyncAt: string | null;
      lastError: string | null;
      briefing: string | null;
      briefingAt: string | null;
      aiConfigured: boolean;
      syncDays: number;
      emails: EmailItem[];
    };

/** Everything the homepage card needs. Reads only; never calls Google or Claude. */
export async function getEmailIntelligence(supabase: Db): Promise<EmailIntelligence> {
  const cfg = getGmailConfig();
  if (!cfg.ok) return { state: "not_configured", missing: cfg.missing, problems: cfg.problems };

  const { data: conn, error } = await supabase
    .from("gmail_connections")
    .select("google_email, status, last_sync_at, last_sync_error, briefing, briefing_at")
    .maybeSingle();
  if (error) throw new Error(`Couldn't load the Gmail connection: ${error.message}`);
  if (!conn) return { state: "not_connected" };

  const { data: rows, error: rowsError } = await supabase
    .from("email_messages")
    .select("id, provider_message_id, from_name, from_email, subject, snippet, received_at, is_unread, task_id, analysis")
    .order("received_at", { ascending: false })
    .limit(200);
  if (rowsError) throw new Error(`Couldn't load emails: ${rowsError.message}`);

  return {
    state: conn.status === "needs_reconnect" ? "needs_reconnect" : "connected",
    account: conn.google_email,
    lastSyncAt: conn.last_sync_at,
    lastError: conn.last_sync_error,
    briefing: conn.briefing,
    briefingAt: conn.briefing_at,
    aiConfigured: getAiConfig().configured,
    syncDays: cfg.config.syncDays,
    emails: rows.map((r) => ({
      id: r.id,
      providerMessageId: r.provider_message_id,
      fromName: r.from_name,
      fromEmail: r.from_email,
      subject: r.subject ?? "(no subject)",
      snippet: r.snippet ?? "",
      receivedAt: r.received_at,
      isUnread: r.is_unread,
      taskId: r.task_id,
      analysis: (r.analysis as unknown as EmailAnalysis | null) ?? null,
    })),
  };
}

/** Runs a sync for the signed-in user with the real Gmail and Claude clients. */
export async function runGmailSync(supabase: Db, userId: string): Promise<SyncResult> {
  const cfg = getGmailConfig();
  if (!cfg.ok) return { ok: false, reason: "not_connected", message: "Gmail isn't set up on the server yet." };
  const ai = getAiConfig();
  const prefs = await getPreferences();
  return syncGmail({
    supabase,
    userId,
    config: cfg.config,
    gmailFor: (refreshToken) => gmailApi(cfg.config, { refreshToken }),
    analyzer: ai.configured && ai.apiKey ? claudeAnalyzer(ai.apiKey, ai.model) : null,
    monthlyBudgetUsd: ai.monthlyBudgetUsd,
    timezone: prefs.timezone,
  });
}
