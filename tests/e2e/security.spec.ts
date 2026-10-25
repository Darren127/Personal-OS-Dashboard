import { expect, test } from "@playwright/test";

import { resetUser } from "./helpers"; // also loads .env.local so the real secret values can be checked for

test("every response carries security headers", async ({ request }) => {
  const res = await request.get("/login");
  const h = res.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-powered-by"]).toBeUndefined();
});

test.describe("health check", () => {
  test("signed out: only shows that the app is up", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const body = await (await anon.get("/api/health")).json();
    expect(Object.keys(body).sort()).toEqual(["ok", "time"]);
    await anon.dispose();
  });

  test("signed in: shows which integrations are configured, as booleans only", async ({ request }) => {
    const body = await (await request.get("/api/health")).json();
    expect(body.integrations).toEqual({ supabase: true, anthropic: true, scheduler: false });
    expect(JSON.stringify(body)).not.toContain("sk-ant");
  });
});

test("no secret reaches the browser", async ({ page }) => {
  await resetUser(); // Gmail not connected, so the Connect button is shown
  const bodies: string[] = [];
  page.on("response", async (r) => {
    if (/\.(js|css)$|text\/html/.test(r.url() + (r.headers()["content-type"] ?? ""))) bodies.push(await r.text().catch(() => ""));
  });
  for (const path of ["/", "/companion", "/settings"]) await page.goto(path, { waitUntil: "networkidle" });
  // The Connect Gmail redirect must carry only the public client ID, never the secret.
  const connect = page.waitForRequest((r) => r.url().startsWith("http://127.0.0.1:4200/o/oauth2/v2/auth"));
  await page.goto("/");
  await page.getByRole("button", { name: "Connect Gmail" }).click();
  const authUrl = (await connect).url();
  bodies.push(authUrl);
  expect(new URL(authUrl).searchParams.get("client_id")).toBe("e2e-client-id");
  const all = bodies.join("\n");
  expect(all.length).toBeGreaterThan(1000);
  // Secret values (Settings may name the variables, but never show their values)
  // Includes the test Google client secret and token-encryption key (see playwright.config.ts).
  for (const secret of ["sk-ant-e2e-mock-key", process.env.SUPABASE_SECRET_KEY!, "e2e-client-secret", Buffer.alloc(32, 7).toString("base64")]) {
    expect(secret).toBeTruthy();
    expect(all.includes(secret), `a page or script contains ${secret.slice(0, 10)}…`).toBe(false);
  }
});
