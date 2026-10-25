import "server-only";

import { createHash } from "node:crypto";

import {
  verifyAnalysis,
  type EmailAnalysis,
  type EmailForAnalysis,
} from "@/lib/email/analysis";
import { parseGmailMessage, type ParsedEmail } from "@/lib/email/mime";
import { monthToDateCostUsd } from "@/lib/server/ai/engine";
import { TRIAGE_BATCH_SIZE, describeAnalysisError, type EmailAnalyzer } from "@/lib/server/gmail/analyze";
import type { GmailConfig } from "@/lib/server/gmail/config";
import { decryptSecret } from "@/lib/server/gmail/crypto";
import {
  classifyGoogleError,
  describeGoogleError,
  type GmailApi,
  type GmailMessageRef,
} from "@/lib/server/gmail/google";
import type { Db } from "@/lib/supabase/server";

const FETCH_CONCURRENCY = 5;
const PAGE_SIZE = 100; // Gmail's list maximum is 500; 100 keeps responses small.

export type SyncDeps = {
  supabase: Db;
  userId: string;
  config: GmailConfig;
  /** Builds a Gmail client from the stored (decrypted) refresh token. */
  gmailFor: (refreshToken: string) => GmailApi;
  /** Null when no Claude API key is configured: messages sync without analysis. */
  analyzer: EmailAnalyzer | null;
  monthlyBudgetUsd: number | null;
  timezone: string;
  now?: Date;
};

export type SyncResult =
  | {
      ok: true;
      listed: number;
      fetched: number;
      skippedMalformed: number;
      pruned: number;
      analyzed: number;
      /** Why analysis was skipped or partial, if it was. */
      analysisNotice: string | null;
    }
  | { ok: false; reason: "not_connected" | "needs_reconnect" | "gmail_error"; message: string };

/** Lists message IDs for a query, following pages until `limit` is reached. */
export async function listMessageIds(gmail: GmailApi, q: string, limit: number) {
  const out: GmailMessageRef[] = [];
  let pageToken: string | undefined;
  do {
    const page = await gmail.listMessages({ q, maxResults: Math.min(PAGE_SIZE, limit - out.length), pageToken });
    out.push(...page.messages);
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < limit);
  return { messages: out.slice(0, limit), complete: !pageToken };
}

/**
 * Unread messages first, then the rest of the window, each message once.
 * Returns which IDs are unread, and whether that list is complete.
 */
export async function selectRecentMessages(gmail: GmailApi, days: number, limit: number) {
  const base = `in:inbox newer_than:${days}d`;
  const unread = await listMessageIds(gmail, `${base} is:unread`, limit);
  const all = unread.messages.length < limit ? await listMessageIds(gmail, base, limit) : { messages: [], complete: false };
  const byId = new Map<string, GmailMessageRef>();
  for (const m of [...unread.messages, ...all.messages]) if (!byId.has(m.id)) byId.set(m.id, m);
  return {
    messages: [...byId.values()].slice(0, limit),
    unreadIds: new Set(unread.messages.map((m) => m.id)),
    unreadComplete: unread.complete,
  };
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

export function contentHash(e: Pick<ParsedEmail, "subject" | "fromEmail" | "fromName" | "bodyText">) {
  return createHash("sha256").update(JSON.stringify([e.subject, e.fromName, e.fromEmail, e.bodyText])).digest("hex");
}

async function recordFailure(supabase: Db, userId: string, message: string, needsReconnect: boolean, now: Date) {
  await supabase
    .from("gmail_connections")
    .update({
      last_sync_error: message,
      last_sync_error_at: now.toISOString(),
      ...(needsReconnect && { status: "needs_reconnect" as const }),
    })
    .eq("user_id", userId);
}

/**
 * Fetches recent Gmail messages, stores new ones, analyses what hasn't been
 * analysed yet, and refreshes the briefing. Read-only towards Gmail.
 */
export async function syncGmail(deps: SyncDeps): Promise<SyncResult> {
  const { supabase, userId, config } = deps;
  const now = deps.now ?? new Date();

  const { data: conn, error: connError } = await supabase
    .from("gmail_connections")
    .select("google_email, refresh_token_enc, status")
    .eq("user_id", userId)
    .maybeSingle();
  if (connError) throw new Error(`Couldn't read the Gmail connection: ${connError.message}`);
  if (!conn) return { ok: false, reason: "not_connected", message: "Gmail isn't connected." };
  if (conn.status === "needs_reconnect") {
    return { ok: false, reason: "needs_reconnect", message: "Gmail access has expired or was revoked. Connect Gmail again." };
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(conn.refresh_token_enc, config.encryptionKey);
  } catch {
    const message = "The stored Gmail credentials can't be read (the encryption key changed). Connect Gmail again.";
    await recordFailure(supabase, userId, message, true, now);
    return { ok: false, reason: "needs_reconnect", message };
  }

  // --- 1. Fetch from Gmail ----------------------------------------------------
  const gmail = deps.gmailFor(refreshToken);
  let listed: Awaited<ReturnType<typeof selectRecentMessages>>;
  let parsed: ParsedEmail[] = [];
  let skippedMalformed = 0;
  let existingIds: Set<string>;
  try {
    listed = await selectRecentMessages(gmail, config.syncDays, config.maxMessages);
    const ids = listed.messages.map((m) => m.id);
    const { data: existing, error } = ids.length
      ? await supabase.from("email_messages").select("provider_message_id").eq("user_id", userId).in("provider_message_id", ids)
      : { data: [], error: null };
    if (error) throw new Error(`Couldn't read stored emails: ${error.message}`);
    existingIds = new Set(existing.map((r) => r.provider_message_id));

    // Only download messages we haven't stored yet.
    const fresh = listed.messages.filter((m) => !existingIds.has(m.id));
    const fetched = await mapLimited(fresh, FETCH_CONCURRENCY, async (m) => {
      try {
        return parseGmailMessage(await gmail.getMessage(m.id));
      } catch (err) {
        const kind = classifyGoogleError(err);
        if (kind === "not_found") return null; // deleted meanwhile
        // Any other Google error stops the sync; a message we can't parse is skipped.
        if (kind !== "other" || (err as { response?: unknown })?.response) throw err;
        skippedMalformed++;
        return null;
      }
    });
    parsed = fetched.filter((p): p is ParsedEmail => p !== null);
  } catch (err) {
    const kind = classifyGoogleError(err);
    if (kind === "other" && !(err as { response?: unknown })?.response) throw err; // a bug, not Google
    const message = describeGoogleError(kind);
    await recordFailure(supabase, userId, message, kind === "revoked" || kind === "insufficient_scope", now);
    return { ok: false, reason: kind === "revoked" || kind === "insufficient_scope" ? "needs_reconnect" : "gmail_error", message };
  }

  // --- 2. Store ---------------------------------------------------------------
  if (parsed.length) {
    const { error } = await supabase.from("email_messages").upsert(
      parsed.map((p) => ({
        user_id: userId,
        provider_message_id: p.id,
        thread_id: p.threadId,
        from_name: p.fromName,
        from_email: p.fromEmail,
        subject: p.subject,
        snippet: p.snippet,
        body_excerpt: p.bodyText,
        received_at: p.receivedAt,
        is_unread: p.isUnread,
        label_ids: p.labelIds,
        content_hash: contentHash(p),
        fetched_at: now.toISOString(),
      })),
      // A concurrent sync may have stored the same message: keep that copy.
      { onConflict: "user_id,provider_message_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Couldn't store emails: ${error.message}`);
  }

  // Keep read/unread state current for messages we already had.
  if (listed.unreadComplete) {
    const known = listed.messages.map((m) => m.id).filter((id) => existingIds.has(id));
    const unread = known.filter((id) => listed.unreadIds.has(id));
    const read = known.filter((id) => !listed.unreadIds.has(id));
    const mark = (ids: string[], is_unread: boolean) =>
      supabase.from("email_messages").update({ is_unread }).eq("user_id", userId).in("provider_message_id", ids);
    if (unread.length) await mark(unread, true);
    if (read.length) await mark(read, false);
  }

  // Drop messages that have left the window.
  const cutoff = new Date(now.getTime() - config.syncDays * 86_400_000).toISOString();
  const { count: pruned } = await supabase
    .from("email_messages")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .lt("received_at", cutoff);

  // --- 3. Analyse ---------------------------------------------------------------
  const analysis = await analysePending(deps, conn.google_email, now);

  await supabase
    .from("gmail_connections")
    .update({ last_sync_at: now.toISOString(), last_sync_error: null, last_sync_error_at: null })
    .eq("user_id", userId);

  return {
    ok: true,
    listed: listed.messages.length,
    fetched: parsed.length,
    skippedMalformed,
    pruned: pruned ?? 0,
    analyzed: analysis.analyzed,
    analysisNotice: analysis.notice,
  };
}

function contextLine(account: string, timezone: string, now: Date) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `Today is ${today} (${timezone}). The reader's address is ${account}.`;
}

async function analysePending(deps: SyncDeps, account: string, now: Date) {
  const { supabase, userId, analyzer, config } = deps;
  if (!analyzer) return { analyzed: 0, notice: "Add a Claude API key (ANTHROPIC_API_KEY) to analyse emails." };
  if (config.analyzeMax === 0) return { analyzed: 0, notice: "Email analysis is turned off (GMAIL_ANALYZE_MAX=0)." };

  if (deps.monthlyBudgetUsd !== null) {
    const spent = await monthToDateCostUsd(supabase, now);
    if (spent >= deps.monthlyBudgetUsd) {
      return { analyzed: 0, notice: `This month's AI budget of US$${deps.monthlyBudgetUsd} has been reached; emails were synced but not analysed.` };
    }
  }

  // Messages never analysed, or whose content changed since. Unread first.
  const { data: rows, error } = await supabase
    .from("email_messages")
    .select("id, provider_message_id, from_name, from_email, subject, body_excerpt, received_at, is_unread, content_hash, analysis_content_hash")
    .eq("user_id", userId)
    .order("is_unread", { ascending: false })
    .order("received_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Couldn't read emails for analysis: ${error.message}`);
  const allPending = rows.filter((r) => r.analysis_content_hash !== r.content_hash);
  const pending = allPending.slice(0, config.analyzeMax);

  const context = contextLine(account, deps.timezone, now);
  let analyzed = 0;
  let notice: string | null = null;

  for (let i = 0; i < pending.length; i += TRIAGE_BATCH_SIZE) {
    const batch = pending.slice(i, i + TRIAGE_BATCH_SIZE);
    const emails: EmailForAnalysis[] = batch.map((r, j) => ({
      ref: `m${j + 1}`,
      fromName: r.from_name,
      fromEmail: r.from_email,
      subject: r.subject ?? "",
      receivedAt: r.received_at,
      isUnread: r.is_unread,
      body: r.body_excerpt ?? "",
    }));
    let result;
    try {
      result = await analyzer.triage(emails, context);
    } catch (err) {
      notice = `Some emails weren't analysed: ${describeAnalysisError(err)}`;
      break;
    }
    await logRun(supabase, userId, "triage", result.model, batch.length, result.usage);

    for (const [j, row] of batch.entries()) {
      const raw = result.value.get(emails[j].ref);
      if (!raw) continue; // not answered — retried on the next sync
      const verified: EmailAnalysis = verifyAnalysis(raw, emails[j]);
      const { error: upError } = await supabase
        .from("email_messages")
        .update({
          analysis: verified,
          importance: verified.importance,
          needs_reply: verified.needs_reply,
          action_required: verified.action_required,
          analysis_model: result.model,
          analysis_content_hash: row.content_hash,
          analyzed_at: now.toISOString(),
        })
        .eq("id", row.id);
      if (!upError) analyzed++;
    }
  }

  const left = allPending.length - analyzed;
  if (!notice && left > 0) {
    notice = `${left} more ${left === 1 ? "email" : "emails"} will be analysed on the next refresh (limit ${config.analyzeMax} per refresh).`;
  }

  if (!notice || analyzed > 0) {
    try {
      await refreshBriefing(deps, context, now);
    } catch (err) {
      notice ??= `The briefing couldn't be updated: ${describeAnalysisError(err)}`;
    }
  }
  return { analyzed, notice };
}

async function logRun(
  supabase: Db,
  userId: string,
  kind: "triage" | "briefing",
  model: string,
  count: number,
  u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null },
) {
  await supabase.from("email_analysis_runs").insert({
    user_id: userId,
    kind,
    model,
    message_count: count,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
  });
}

/** Rewrites the briefing only when the analysed emails changed. */
async function refreshBriefing(deps: SyncDeps, context: string, now: Date) {
  const { supabase, userId, analyzer } = deps;
  if (!analyzer) return;
  const { data: rows } = await supabase
    .from("email_messages")
    .select("provider_message_id, from_name, from_email, subject, received_at, is_unread, analysis, analyzed_at")
    .eq("user_id", userId)
    .not("analysis", "is", null)
    .order("received_at", { ascending: false })
    .limit(40);
  const { data: conn } = await supabase.from("gmail_connections").select("briefing_source_hash").eq("user_id", userId).single();
  if (!rows?.length) {
    await supabase.from("gmail_connections").update({ briefing: null, briefing_at: null, briefing_source_hash: null }).eq("user_id", userId);
    return;
  }
  const sourceHash = createHash("sha256")
    .update(JSON.stringify(rows.map((r) => [r.provider_message_id, r.analyzed_at, r.is_unread])))
    .digest("hex");
  if (conn?.briefing_source_hash === sourceHash) return;

  const items = rows
    .map((r) => {
      const a = r.analysis as unknown as EmailAnalysis;
      const deadlines = a.deadlines.map((d) => `${d.description}${d.date ? ` (due ${d.date})` : ""}`).join("; ");
      return `- [${a.importance}${r.is_unread ? ", unread" : ""}${a.needs_reply ? ", reply needed" : ""}${a.suspicious ? ", suspicious" : ""}] from ${r.from_name ?? r.from_email ?? "unknown"}: "${r.subject}" — ${a.summary}${deadlines ? ` Deadlines: ${deadlines}.` : ""}`;
    })
    .join("\n");
  const result = await analyzer.briefing(items, context);
  await logRun(supabase, userId, "briefing", result.model, rows.length, result.usage);
  await supabase
    .from("gmail_connections")
    .update({ briefing: result.value, briefing_at: now.toISOString(), briefing_source_hash: sourceHash })
    .eq("user_id", userId);
}
