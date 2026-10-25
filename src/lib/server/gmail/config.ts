import "server-only";

import { readServerEnv } from "@/lib/server/env";

/** The one Gmail permission requested: read messages and settings, nothing else. */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** The callback route this app implements. GOOGLE_REDIRECT_URI must end with it. */
export const CALLBACK_PATH = "/api/gmail/callback";

export type GmailConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** 32-byte key for encrypting refresh tokens at rest. */
  encryptionKey: Buffer;
  /** Only messages received in the last N days are synced. */
  syncDays: number;
  /** At most this many messages are kept per sync (unread first). */
  maxMessages: number;
  /** At most this many new messages are sent to Claude per sync. */
  analyzeMax: number;
  /** Test-only overrides so automated tests can use a fake Google. */
  oauthBaseUrl?: string;
  gmailApiUrl?: string;
};

export type GmailConfigResult =
  | { ok: true; config: GmailConfig }
  | { ok: false; missing: string[]; problems: string[] };

/**
 * Reads the Gmail settings. Returns which variables are missing or invalid
 * (names only, never values) so the UI can say exactly what to set.
 */
export function getGmailConfig(): GmailConfigResult {
  const { env, problems: envProblems } = readServerEnv();
  const problems = envProblems.filter((p) => /GOOGLE_|GMAIL_/.test(p));
  const missing = (
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GOOGLE_TOKEN_ENCRYPTION_KEY"] as const
  ).filter((k) => !env[k]);

  let encryptionKey: Buffer | null = null;
  if (env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    const key = Buffer.from(env.GOOGLE_TOKEN_ENCRYPTION_KEY, "base64");
    if (key.length === 32) encryptionKey = key;
    else problems.push("GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 random bytes, base64-encoded (see .env.example).");
  }
  if (env.GOOGLE_REDIRECT_URI && new URL(env.GOOGLE_REDIRECT_URI).pathname !== CALLBACK_PATH) {
    problems.push(`GOOGLE_REDIRECT_URI must end with ${CALLBACK_PATH}.`);
  }

  if (missing.length || problems.length || !encryptionKey) return { ok: false, missing, problems };
  return {
    ok: true,
    config: {
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      redirectUri: env.GOOGLE_REDIRECT_URI!,
      encryptionKey,
      syncDays: env.GMAIL_SYNC_DAYS ?? 7,
      maxMessages: env.GMAIL_SYNC_MAX_MESSAGES ?? 50,
      analyzeMax: env.GMAIL_ANALYZE_MAX ?? 25,
      oauthBaseUrl: process.env.PERSONAL_OS_GOOGLE_OAUTH_URL || undefined,
      gmailApiUrl: process.env.PERSONAL_OS_GMAIL_API_URL || undefined,
    },
  };
}
