import "server-only";

import { gmail, type gmail_v1 } from "@googleapis/gmail";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";

import { GMAIL_SCOPE, type GmailConfig } from "@/lib/server/gmail/config";

/**
 * Everything that talks to Google lives here, behind small types, so the sync
 * logic can be tested with a fake Gmail and no network.
 */

export function oauthClient(config: GmailConfig) {
  const base = config.oauthBaseUrl;
  return new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    ...(base && {
      endpoints: {
        oauth2AuthBaseUrl: `${base}/o/oauth2/v2/auth`,
        oauth2TokenUrl: `${base}/token`,
        oauth2RevokeUrl: `${base}/revoke`,
      },
    }),
  });
}

/** Builds Google's consent-screen URL (authorization-code flow with PKCE). */
export async function startAuthorization(config: GmailConfig, state: string) {
  const client = oauthClient(config);
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const url = client.generateAuthUrl({
    // "offline" returns a refresh token so the server can sync later.
    access_type: "offline",
    // Always show consent so Google returns a refresh token even on reconnect.
    prompt: "consent",
    scope: [GMAIL_SCOPE],
    include_granted_scopes: false,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
  return { url, codeVerifier };
}

/** Exchanges the one-time code for tokens. */
export async function exchangeCode(config: GmailConfig, code: string, codeVerifier: string) {
  const { tokens } = await oauthClient(config).getToken({ code, codeVerifier });
  const scopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean);
  return { refreshToken: tokens.refresh_token ?? null, accessToken: tokens.access_token ?? null, scopes };
}

/** Asks Google to revoke the token. Failure is reported, not thrown. */
export async function revokeRefreshToken(config: GmailConfig, refreshToken: string) {
  try {
    await oauthClient(config).revokeToken(refreshToken);
    return true;
  } catch (err) {
    // Already revoked or expired tokens can't be revoked again; that's fine.
    return classifyGoogleError(err) === "revoked";
  }
}

export type GmailMessageRef = { id: string; threadId: string };

/** The few Gmail calls this app makes — all read-only. */
export type GmailApi = {
  getProfile(): Promise<{ emailAddress: string }>;
  listMessages(opts: { q: string; maxResults: number; pageToken?: string }): Promise<{
    messages: GmailMessageRef[];
    nextPageToken?: string;
  }>;
  getMessage(id: string): Promise<gmail_v1.Schema$Message>;
};

/** A Gmail client authorised with a stored refresh token (access tokens refresh automatically). */
export function gmailApi(config: GmailConfig, credentials: { refreshToken?: string; accessToken?: string }): GmailApi {
  const auth = oauthClient(config);
  auth.setCredentials({ refresh_token: credentials.refreshToken, access_token: credentials.accessToken });
  const api = gmail({
    version: "v1",
    auth,
    ...(config.gmailApiUrl && { rootUrl: `${config.gmailApiUrl}/` }),
  });
  return {
    async getProfile() {
      const { data } = await api.users.getProfile({ userId: "me" });
      if (!data.emailAddress) throw new Error("Gmail didn't return an email address.");
      return { emailAddress: data.emailAddress };
    },
    async listMessages({ q, maxResults, pageToken }) {
      const { data } = await api.users.messages.list({ userId: "me", q, maxResults, pageToken });
      return {
        messages: (data.messages ?? [])
          .filter((m): m is { id: string; threadId: string } => Boolean(m.id && m.threadId))
          .map((m) => ({ id: m.id, threadId: m.threadId })),
        nextPageToken: data.nextPageToken ?? undefined,
      };
    },
    async getMessage(id) {
      const { data } = await api.users.messages.get({ userId: "me", id, format: "full" });
      return data;
    },
  };
}

export type GoogleErrorKind = "revoked" | "insufficient_scope" | "rate_limited" | "not_found" | "network" | "other";

/**
 * Sorts a Google error into what the app should do about it.
 * "revoked" covers expired, revoked, and invalid refresh tokens: the only fix
 * is to connect again.
 */
export function classifyGoogleError(err: unknown): GoogleErrorKind {
  const e = err as { response?: { status?: number; data?: unknown }; code?: string | number; message?: string };
  const status = e?.response?.status;
  const data = JSON.stringify(e?.response?.data ?? "");
  const message = String(e?.message ?? "");
  if (/invalid_grant|unauthorized_client|Token has been expired or revoked/i.test(`${data} ${message}`)) return "revoked";
  if (status === 401) return "revoked";
  if (status === 403 && /insufficient|scope|PERMISSION/i.test(`${data} ${message}`)) return "insufficient_scope";
  if (status === 429 || (status === 403 && /rateLimit|userRateLimit/i.test(data))) return "rate_limited";
  if (status === 404) return "not_found";
  if (!status && /ECONN|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(`${e?.code ?? ""} ${message}`)) return "network";
  return "other";
}

/** A short, safe explanation for the UI. Never includes tokens or raw responses. */
export function describeGoogleError(kind: GoogleErrorKind): string {
  switch (kind) {
    case "revoked":
      return "Gmail access has expired or was revoked. Connect Gmail again.";
    case "insufficient_scope":
      return "Gmail permission wasn't granted. Connect again and allow reading your email.";
    case "rate_limited":
      return "Gmail is limiting requests right now. Try again in a few minutes.";
    case "network":
      return "Couldn't reach Gmail. Check your connection and try again.";
    case "not_found":
      return "A message couldn't be found in Gmail (it may have been deleted).";
    default:
      return "Gmail returned an unexpected error. Try again later.";
  }
}
