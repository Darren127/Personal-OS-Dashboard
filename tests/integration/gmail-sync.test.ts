/**
 * Gmail sync against the local Supabase database, signed in as a test user,
 * with a fake Gmail and a fake analyzer (no network, no cost).
 * Skipped if the local database isn't running.
 */
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { EmailForAnalysis, RawEmailAnalysis } from "@/lib/email/analysis";
import type { EmailAnalyzer } from "@/lib/server/gmail/analyze";
import type { GmailConfig } from "@/lib/server/gmail/config";
import { encryptSecret } from "@/lib/server/gmail/crypto";
import type { GmailApi } from "@/lib/server/gmail/google";
import { selectRecentMessages, syncGmail } from "@/lib/server/gmail/sync";
import type { Database } from "@/lib/supabase/database.types";
import type { Db } from "@/lib/supabase/server";

const EMAIL = "gmail-sync-test@personal-os.local";
const PASSWORD = "gmail-sync-test-password";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;

const reachable = await (async () => {
  if (!URL || !KEY || !SECRET) return false;
  try {
    return (await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY } })).ok;
  } catch {
    return false;
  }
})();

const NOW = new Date("2026-10-25T12:00:00Z");
const encryptionKey = randomBytes(32);
const config: GmailConfig = {
  clientId: "test",
  clientSecret: "test",
  redirectUri: "http://localhost/api/gmail/callback",
  encryptionKey,
  syncDays: 7,
  maxMessages: 5,
  analyzeMax: 25,
};

type FakeMsg = { id: string; unread: boolean; hoursAgo: number; subject: string; body: string; malformed?: boolean };

/** A Gmail that serves `messages` newest-first, `pageSize` per page, and counts calls. */
function fakeGmail(messages: FakeMsg[], pageSize = 2) {
  const calls = { list: 0, get: [] as string[] };
  const api: GmailApi = {
    async getProfile() {
      return { emailAddress: "me@gmail.com" };
    },
    async listMessages({ q, maxResults, pageToken }) {
      calls.list++;
      const pool = messages.filter((m) => !q.includes("is:unread") || m.unread).sort((a, b) => a.hoursAgo - b.hoursAgo);
      const start = Number(pageToken ?? 0);
      const size = Math.min(pageSize, maxResults);
      const page = pool.slice(start, start + size);
      return {
        messages: page.map((m) => ({ id: m.id, threadId: `t-${m.id}` })),
        nextPageToken: start + size < pool.length ? String(start + size) : undefined,
      };
    },
    async getMessage(id) {
      calls.get.push(id);
      const m = messages.find((x) => x.id === id)!;
      if (m.malformed) return { id: null, threadId: null };
      return {
        id: m.id,
        threadId: `t-${m.id}`,
        labelIds: m.unread ? ["INBOX", "UNREAD"] : ["INBOX"],
        internalDate: String(NOW.getTime() - m.hoursAgo * 3_600_000),
        snippet: m.body.slice(0, 50),
        payload: {
          mimeType: "text/plain",
          headers: [{ name: "From", value: "Sender <sender@example.com>" }, { name: "Subject", value: m.subject }],
          body: { data: Buffer.from(m.body).toString("base64url") },
        },
      };
    },
  };
  return { api, calls };
}

/** An analyzer that marks "URGENT" subjects critical and quotes a real or invented deadline. */
function fakeAnalyzer() {
  const seen: EmailForAnalysis[][] = [];
  const analyzer: EmailAnalyzer = {
    async triage(emails) {
      seen.push(emails);
      const value = new Map<string, RawEmailAnalysis>(
        emails.map((e) => [
          e.ref,
          {
            ref: e.ref,
            importance: e.subject.includes("URGENT") ? "critical" : "low",
            summary: `About: ${e.subject}`,
            importance_reason: "test",
            needs_reply: e.subject.includes("?"),
            action_required: false,
            deadlines: [
              { quote: "due 30 October", date: "2026-10-30", description: "Real deadline" },
              { quote: "due 1 December", date: "2026-12-01", description: "Invented deadline" },
            ],
            action_items: [],
            suggested_next_action: null,
            confidence: "high",
            uncertainty: null,
            suspicious: e.body.includes("Ignore previous instructions"),
            suspicious_reason: null,
          },
        ]),
      );
      return { value, model: "claude-opus-5-5", usage: { input_tokens: 1000, output_tokens: 200 } };
    },
    async briefing(items) {
      return { value: `Briefing over ${items.split("\n").length} emails.`, model: "claude-opus-5-5", usage: { input_tokens: 300, output_tokens: 50 } };
    },
  };
  return { analyzer, seen };
}

let supabase: SupabaseClient<Database>;
let admin: SupabaseClient<Database>;
let userId: string;

async function connect(refreshToken = "1//fake-refresh-token", status: "active" | "needs_reconnect" = "active") {
  await supabase.from("gmail_connections").upsert({
    user_id: userId,
    google_email: "me@gmail.com",
    refresh_token_enc: encryptSecret(refreshToken, encryptionKey),
    status,
  });
}

const deps = (gmail: GmailApi, analyzer: EmailAnalyzer | null) => ({
  supabase: supabase as unknown as Db,
  userId,
  config,
  gmailFor: () => gmail,
  analyzer,
  monthlyBudgetUsd: null,
  timezone: "UTC",
  now: NOW,
});

describe.skipIf(!reachable)("Gmail sync (real database)", () => {
  beforeAll(async () => {
    admin = createClient<Database>(URL!, SECRET!, { auth: { persistSession: false } });
    const existing = await admin.auth.admin.listUsers();
    if (!existing.data.users.some((u) => u.email === EMAIL)) {
      const { error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
      if (error) throw error;
    }
    supabase = createClient<Database>(URL!, KEY!, { auth: { persistSession: false } });
    const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (error) throw error;
    userId = data.user.id;
  });

  beforeEach(async () => {
    for (const t of ["email_messages", "gmail_connections", "email_analysis_runs", "tasks"] as const) {
      await admin.from(t).delete().eq("user_id", userId);
    }
  });

  it("puts unread first, pages through results, deduplicates, and respects the limit", async () => {
    const { api, calls } = fakeGmail(
      [
        { id: "a", unread: false, hoursAgo: 1, subject: "Newest, read", body: "x" },
        { id: "b", unread: true, hoursAgo: 2, subject: "Unread 1", body: "x" },
        { id: "c", unread: false, hoursAgo: 3, subject: "Read", body: "x" },
        { id: "d", unread: true, hoursAgo: 4, subject: "Unread 2", body: "x" },
        { id: "e", unread: true, hoursAgo: 5, subject: "Unread 3", body: "x" },
        { id: "f", unread: false, hoursAgo: 6, subject: "Old read", body: "x" },
      ],
      2,
    );
    const r = await selectRecentMessages(api, 7, 5);
    expect(r.messages.map((m) => m.id)).toEqual(["b", "d", "e", "a", "c"]);
    expect([...r.unreadIds]).toEqual(["b", "d", "e"]);
    expect(r.unreadComplete).toBe(true);
    expect(calls.list).toBeGreaterThan(2); // several pages
  });

  it("stores, analyses with verified deadlines, briefs, and skips work already done", async () => {
    await connect();
    const { api, calls } = fakeGmail([
      { id: "m1", unread: true, hoursAgo: 1, subject: "URGENT: contract", body: "Please sign, due 30 October." },
      { id: "m2", unread: false, hoursAgo: 2, subject: "Lunch?", body: "Free on Tuesday?" },
      { id: "m3", unread: true, hoursAgo: 3, subject: "Broken", body: "", malformed: true },
    ]);
    const { analyzer, seen } = fakeAnalyzer();

    const first = await syncGmail(deps(api, analyzer));
    expect(first).toMatchObject({ ok: true, listed: 3, fetched: 2, skippedMalformed: 1, analyzed: 2, analysisNotice: null });

    const { data: rows } = await supabase.from("email_messages").select("provider_message_id, importance, needs_reply, is_unread, analysis").order("received_at", { ascending: false });
    expect(rows!.map((r) => [r.provider_message_id, r.importance, r.needs_reply, r.is_unread])).toEqual([
      ["m1", "critical", false, true],
      ["m2", "low", true, false],
    ]);
    const m1 = rows![0].analysis as { deadlines: { description: string }[]; rejected_deadlines: number };
    expect(m1.deadlines.map((d) => d.description)).toEqual(["Real deadline"]);
    expect(m1.rejected_deadlines).toBe(1);
    const m2 = rows![1].analysis as { deadlines: unknown[] };
    expect(m2.deadlines).toEqual([]); // the email never mentions a deadline

    const { data: conn } = await supabase.from("gmail_connections").select("briefing, last_sync_at, last_sync_error").single();
    expect(conn).toMatchObject({ briefing: "Briefing over 2 emails.", last_sync_error: null });
    expect(Date.parse(conn!.last_sync_at!)).toBe(NOW.getTime());
    const { data: runs } = await supabase.from("email_analysis_runs").select("kind, message_count");
    expect(runs!.map((r) => r.kind).sort()).toEqual(["briefing", "triage"]);

    // Second sync: nothing new to download or analyse, so no Claude calls.
    const getsBefore = calls.get.length;
    const second = await syncGmail(deps(api, analyzer));
    expect(second).toMatchObject({ ok: true, fetched: 0, analyzed: 0 });
    expect(calls.get.length - getsBefore).toBe(1); // only the malformed one is retried
    expect(seen).toHaveLength(1);
    const { count } = await supabase.from("email_analysis_runs").select("*", { count: "exact", head: true });
    expect(count).toBe(2);
  });

  it("syncs without analysis when no Claude key is configured", async () => {
    await connect();
    const { api } = fakeGmail([{ id: "n1", unread: true, hoursAgo: 1, subject: "Hello", body: "Hi" }]);
    const r = await syncGmail(deps(api, null));
    expect(r).toMatchObject({ ok: true, fetched: 1, analyzed: 0 });
    expect(r.ok && r.analysisNotice).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("marks the connection for reconnecting when Google revokes access", async () => {
    await connect();
    const revoked: GmailApi = {
      ...fakeGmail([]).api,
      async listMessages() {
        throw Object.assign(new Error("invalid_grant"), { response: { status: 400, data: { error: "invalid_grant" } } });
      },
    };
    const r = await syncGmail(deps(revoked, null));
    expect(r).toEqual({ ok: false, reason: "needs_reconnect", message: "Gmail access has expired or was revoked. Connect Gmail again." });
    const { data } = await supabase.from("gmail_connections").select("status, last_sync_error").single();
    expect(data).toMatchObject({ status: "needs_reconnect", last_sync_error: expect.stringMatching(/expired or was revoked/) });

    // Further syncs stop immediately, without calling Google.
    expect(await syncGmail(deps(revoked, null))).toMatchObject({ ok: false, reason: "needs_reconnect" });
  });

  it("reports temporary Gmail errors without disconnecting", async () => {
    await connect();
    const limited: GmailApi = {
      ...fakeGmail([]).api,
      async listMessages() {
        throw Object.assign(new Error("Rate limit"), { response: { status: 429, data: {} } });
      },
    };
    expect(await syncGmail(deps(limited, null))).toMatchObject({ ok: false, reason: "gmail_error" });
    const { data } = await supabase.from("gmail_connections").select("status").single();
    expect(data!.status).toBe("active");
  });

  it("asks for a reconnect if the stored token can't be decrypted", async () => {
    await supabase.from("gmail_connections").insert({ user_id: userId, google_email: "me@gmail.com", refresh_token_enc: "v1.bad.bad.bad" });
    expect(await syncGmail(deps(fakeGmail([]).api, null))).toMatchObject({ ok: false, reason: "needs_reconnect" });
  });

  it("returns not_connected when Gmail isn't connected", async () => {
    expect(await syncGmail(deps(fakeGmail([]).api, null))).toMatchObject({ ok: false, reason: "not_connected" });
  });

  it("prunes messages that fall outside the sync window", async () => {
    await connect();
    await supabase.from("email_messages").insert({
      provider_message_id: "old",
      thread_id: "t",
      received_at: "2026-10-01T00:00:00Z",
      content_hash: "h",
    });
    const r = await syncGmail(deps(fakeGmail([]).api, null));
    expect(r).toMatchObject({ ok: true, pruned: 1 });
  });

  it("keeps each user's email private", async () => {
    await connect();
    await syncGmail(deps(fakeGmail([{ id: "p1", unread: true, hoursAgo: 1, subject: "Private", body: "x" }]).api, null));
    const other = createClient<Database>(URL!, KEY!, { auth: { persistSession: false } });
    const { data: anonRows } = await other.from("email_messages").select("id");
    expect(anonRows ?? []).toEqual([]);
    const { data: anonConn } = await other.from("gmail_connections").select("refresh_token_enc");
    expect(anonConn ?? []).toEqual([]);
  });
});
