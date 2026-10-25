import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, signPayload, verifyPayload } from "@/lib/server/gmail/crypto";
import { classifyGoogleError } from "@/lib/server/gmail/google";
import { checkState, stateCookieValue } from "@/lib/server/gmail/oauth-state";

const key = randomBytes(32);

describe("refresh-token encryption", () => {
  it("round-trips, uses a fresh IV each time, and never contains the plaintext", () => {
    const a = encryptSecret("1//refresh-token", key);
    const b = encryptSecret("1//refresh-token", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("refresh-token");
    expect(decryptSecret(a, key)).toBe("1//refresh-token");
  });

  it("fails on a wrong key or any tampering", () => {
    const enc = encryptSecret("secret", key);
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
    const parts = enc.split(".");
    parts[3] = Buffer.from("other").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret("garbage", key)).toThrow();
  });
});

describe("OAuth state (CSRF) check", () => {
  const now = 1_000_000;
  const cookie = stateCookieValue("state-abc", "verifier-xyz", "user-1", key, now);

  it("accepts the matching state for the same user within 10 minutes", () => {
    expect(checkState(cookie, "state-abc", "user-1", key, now + 60_000)).toEqual({ ok: true, codeVerifier: "verifier-xyz" });
  });

  it("rejects missing, forged, expired, mismatched, and other-user states", () => {
    expect(checkState(undefined, "state-abc", "user-1", key, now)).toMatchObject({ reason: "missing" });
    expect(checkState(cookie, "state-abc", "user-1", randomBytes(32), now)).toMatchObject({ reason: "tampered" });
    const forged = signPayload({ s: "state-abc", v: "v", u: "user-1", exp: now + 1 }, randomBytes(32));
    expect(checkState(forged, "state-abc", "user-1", key, now)).toMatchObject({ reason: "tampered" });
    expect(checkState(cookie, "state-abc", "user-1", key, now + 601_000)).toMatchObject({ reason: "expired" });
    expect(checkState(cookie, "state-evil", "user-1", key, now)).toMatchObject({ reason: "mismatch" });
    expect(checkState(cookie, null, "user-1", key, now)).toMatchObject({ reason: "mismatch" });
    expect(checkState(cookie, "state-abc", "user-2", key, now)).toMatchObject({ reason: "wrong_user" });
  });

  it("rejects a cookie whose signature was edited", () => {
    const [body, sig] = cookie.split(".");
    expect(verifyPayload(`${body}x.${sig}`, key)).toBeNull();
    expect(verifyPayload(`${body}.${sig.slice(0, -2)}`, key)).toBeNull();
  });
});

describe("Google error handling", () => {
  it("treats revoked, expired, or invalid grants as needing a reconnect", () => {
    expect(classifyGoogleError({ response: { status: 400, data: { error: "invalid_grant", error_description: "Token has been expired or revoked." } } })).toBe("revoked");
    expect(classifyGoogleError({ response: { status: 401, data: {} } })).toBe("revoked");
    expect(classifyGoogleError({ message: "invalid_grant" })).toBe("revoked");
  });

  it("recognises missing scope, rate limits, missing messages, and network failures", () => {
    expect(classifyGoogleError({ response: { status: 403, data: { error: { message: "Request had insufficient authentication scopes." } } } })).toBe("insufficient_scope");
    expect(classifyGoogleError({ response: { status: 429, data: {} } })).toBe("rate_limited");
    expect(classifyGoogleError({ response: { status: 403, data: { error: { errors: [{ reason: "userRateLimitExceeded" }] } } } })).toBe("rate_limited");
    expect(classifyGoogleError({ response: { status: 404, data: {} } })).toBe("not_found");
    expect(classifyGoogleError({ code: "ECONNRESET", message: "socket hang up" })).toBe("network");
    expect(classifyGoogleError(new Error("boom"))).toBe("other");
  });
});
