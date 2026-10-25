import "server-only";

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Encrypts a secret (a Google refresh token) for storage: AES-256-GCM with a
 * random IV. The output is "v1.<iv>.<tag>.<ciphertext>" in base64url.
 * GCM's tag means any tampering makes decryption fail instead of returning junk.
 */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Reverses encryptSecret. Throws if the key is wrong or the value was altered. */
export function decryptSecret(stored: string, key: Buffer): string {
  const [version, iv, tag, ct] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised encrypted value.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** Signs a small JSON payload (used for the OAuth state cookie). */
export function signPayload(payload: object, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body, key)}`;
}

/** Returns the payload if the signature is valid, otherwise null. */
export function verifyPayload<T>(signed: string | undefined, key: Buffer): T | null {
  if (!signed) return null;
  const [body, sig] = signed.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(hmac(body, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function hmac(data: string, key: Buffer) {
  // A distinct key for signing, derived so the encryption key is never reused directly.
  const signingKey = createHmac("sha256", key).update("personal-os/oauth-state").digest();
  return createHmac("sha256", signingKey).update(data).digest("base64url");
}
