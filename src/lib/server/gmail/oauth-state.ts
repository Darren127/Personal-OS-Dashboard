import "server-only";

import { randomBytes } from "node:crypto";

import { safeEqual, signPayload, verifyPayload } from "@/lib/server/gmail/crypto";

/**
 * CSRF protection for the OAuth round trip. Before sending the user to
 * Google we create a random `state`, and keep it (with the PKCE verifier and
 * the user's ID) in a signed, HTTP-only cookie scoped to the callback path.
 * The callback accepts Google's answer only if the `state` it carries matches
 * the cookie, the cookie is fresh, and the same user is signed in.
 */

export const STATE_COOKIE = "pos_gmail_oauth";
export const STATE_TTL_SECONDS = 600;

type StatePayload = { s: string; v: string; u: string; exp: number };

export function newState() {
  return randomBytes(32).toString("base64url");
}

export function stateCookieValue(state: string, codeVerifier: string, userId: string, key: Buffer, now = Date.now()) {
  return signPayload({ s: state, v: codeVerifier, u: userId, exp: now + STATE_TTL_SECONDS * 1000 } satisfies StatePayload, key);
}

export type StateCheck = { ok: true; codeVerifier: string } | { ok: false; reason: "missing" | "tampered" | "expired" | "mismatch" | "wrong_user" };

export function checkState(
  cookieValue: string | undefined,
  returnedState: string | null,
  userId: string,
  key: Buffer,
  now = Date.now(),
): StateCheck {
  if (!cookieValue) return { ok: false, reason: "missing" };
  const payload = verifyPayload<StatePayload>(cookieValue, key);
  if (!payload || typeof payload.s !== "string" || typeof payload.v !== "string") return { ok: false, reason: "tampered" };
  if (typeof payload.exp !== "number" || payload.exp < now) return { ok: false, reason: "expired" };
  if (!returnedState || !safeEqual(payload.s, returnedState)) return { ok: false, reason: "mismatch" };
  if (payload.u !== userId) return { ok: false, reason: "wrong_user" };
  return { ok: true, codeVerifier: payload.v };
}

export const stateCookieOptions = {
  httpOnly: true,
  // "lax" so the cookie is sent when Google redirects back (a top-level GET).
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/gmail/callback",
  maxAge: STATE_TTL_SECONDS,
};
