import { type NextRequest, NextResponse } from "next/server";

import { GMAIL_SCOPE, getGmailConfig } from "@/lib/server/gmail/config";
import { encryptSecret } from "@/lib/server/gmail/crypto";
import { exchangeCode, gmailApi, revokeRefreshToken } from "@/lib/server/gmail/google";
import { STATE_COOKIE, checkState, stateCookieOptions } from "@/lib/server/gmail/oauth-state";
import { createClient, getSupabaseConfig } from "@/lib/supabase/server";

/**
 * Google sends the user back here after the consent screen. This exact URL
 * (origin + /api/gmail/callback) must be GOOGLE_REDIRECT_URI and be registered
 * in Google Cloud Console.
 *
 * Nothing from the query string is trusted until the state check passes, and
 * no code, token, or Google response is ever logged or put in a URL.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // Every exit clears the one-time state cookie and lands on My Day with a status.
  const finish = (status: string) => {
    const res = NextResponse.redirect(new URL(`/?gmail=${status}`, request.url));
    res.cookies.set(STATE_COOKIE, "", { ...stateCookieOptions, maxAge: 0 });
    return res;
  };

  const cfg = getGmailConfig();
  if (!cfg.ok || !getSupabaseConfig()) return finish("not_configured");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return NextResponse.redirect(new URL("/login", request.url));

  const check = checkState(request.cookies.get(STATE_COOKIE)?.value, params.get("state"), userId, cfg.config.encryptionKey);
  if (!check.ok) return finish(check.reason === "expired" ? "expired" : "invalid_state");

  // The user pressed "Cancel" on Google's screen, or Google reported a problem.
  const oauthError = params.get("error");
  if (oauthError) return finish(oauthError === "access_denied" ? "denied" : "error");
  const code = params.get("code");
  if (!code || code.length > 2000) return finish("error");

  let tokens: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    tokens = await exchangeCode(cfg.config, code, check.codeVerifier);
  } catch {
    return finish("error");
  }

  // With granular consent the user can untick Gmail access while approving.
  if (!tokens.scopes.includes(GMAIL_SCOPE)) {
    if (tokens.refreshToken) await revokeRefreshToken(cfg.config, tokens.refreshToken);
    return finish("scope_missing");
  }
  if (!tokens.refreshToken) return finish("no_refresh_token");

  // Prove the access works with a real, read-only Gmail request before saving.
  let account: string;
  try {
    const profile = await gmailApi(cfg.config, {
      refreshToken: tokens.refreshToken,
      accessToken: tokens.accessToken ?? undefined,
    }).getProfile();
    account = profile.emailAddress.toLowerCase();
  } catch {
    return finish("error");
  }

  // Reconnecting a different Gmail account: drop the previous account's emails.
  const { data: previous } = await supabase.from("gmail_connections").select("google_email").maybeSingle();
  if (previous && previous.google_email !== account) {
    await supabase.from("email_messages").delete().eq("user_id", userId);
  }

  const { error } = await supabase.from("gmail_connections").upsert(
    {
      user_id: userId,
      google_email: account,
      refresh_token_enc: encryptSecret(tokens.refreshToken, cfg.config.encryptionKey),
      scopes: tokens.scopes,
      status: "active",
      connected_at: new Date().toISOString(),
      last_sync_error: null,
      last_sync_error_at: null,
      ...(previous && previous.google_email !== account && { briefing: null, briefing_at: null, briefing_source_hash: null, last_sync_at: null }),
    },
    { onConflict: "user_id" },
  );
  if (error) return finish("error");
  return finish("connected");
}
