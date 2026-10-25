/**
 * Gmail Intelligence end to end: the real OAuth flow (state, PKCE, code
 * exchange), Gmail sync, Claude analysis, and the homepage card — against
 * test-only fakes of Google (mock-google.mjs) and Claude (mock-anthropic.mjs).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { adminClient, resetUser, toast, trackErrors } from "./helpers";

const GOOGLE = "http://127.0.0.1:4200";
const CLAUDE = "http://127.0.0.1:4100";
const getJson = async (url: string) => (await fetch(url)).json();
const setConsent = (mode: "ok" | "deny" | "no_scope") => fetch(`${GOOGLE}/__mode?consent=${mode}`, { method: "POST" });

let uid: string;
test.beforeEach(async () => {
  uid = await resetUser();
  await setConsent("ok");
});

const emailCard = (page: Page) => page.getByTestId("email-intelligence");

async function connect(page: Page) {
  await page.goto("/");
  await emailCard(page).getByRole("button", { name: "Connect Gmail" }).click();
  await toast(page, "Gmail connected");
  await expect(page).toHaveURL(/localhost:3100\/$/); // status removed from the URL
}

test("connect, sync, analyse, and turn an action item into a task — after confirmation", async ({ page }) => {
  const errors = trackErrors(page);
  const claudeBefore = await getJson(`${CLAUDE}/__stats`);
  await connect(page);
  const card = emailCard(page);
  await expect(card).toContainText("me@gmail.test · not synced yet");

  // The token is stored encrypted, with the granted scope.
  const { data: conn } = await adminClient().from("gmail_connections").select("refresh_token_enc, scopes, status").eq("user_id", uid).single();
  expect(conn!.refresh_token_enc).toMatch(/^v1\./);
  expect(conn!.refresh_token_enc).not.toContain("1//refresh");
  expect(conn).toMatchObject({ scopes: ["https://www.googleapis.com/auth/gmail.readonly"], status: "active" });

  await card.getByRole("button", { name: "Refresh email" }).click();
  await toast(page, "Gmail synced: 4 new emails, 4 analysed");
  await expect(card).toContainText("Invoice #1042 is due 30 October. Sam is waiting for a reply about lunch.");
  await expect(card).toContainText("last synced");

  // Urgent tab: the invoice with its verified deadline; the invented one is not shown.
  const invoice = card.locator("li", { hasText: "Invoice #1042" });
  await expect(invoice).toContainText("High");
  await expect(invoice).toContainText("due 2026-10-30 — the email says “Payment is due 30 October”");
  await expect(card).not.toContainText("late fee");
  await expect(invoice.getByRole("link", { name: /Invoice #1042/ })).toHaveAttribute("href", "https://mail.google.com/mail/?authuser=me%40gmail.test#all/msg-invoice");

  // Needs-reply tab.
  await card.getByRole("tab", { name: /Needs reply/ }).click();
  await expect(card.locator("li", { hasText: "Lunch on Thursday?" })).toContainText("Reply needed");

  // Turning an action item into a task asks first, and uses only the verified deadline.
  await card.getByRole("tab", { name: /Urgent/ }).click();
  await invoice.getByRole("button", { name: /Task: Pay invoice #1042/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Create this task?");
  await expect(dialog).toContainText("2026-10-30");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect((await adminClient().from("tasks").select("id").eq("user_id", uid)).data).toHaveLength(0);

  await invoice.getByRole("button", { name: /Task: Pay invoice #1042/ }).click();
  await dialog.getByRole("button", { name: "Create task" }).click();
  await toast(page, "Task created in your Inbox");
  await expect(invoice).toContainText("Task created");
  const { data: tasks } = await adminClient().from("tasks").select("title, due_date, priority, tags, description").eq("user_id", uid);
  expect(tasks).toHaveLength(1);
  expect(tasks![0]).toMatchObject({ title: "Pay invoice #1042 ($1,200)", due_date: "2026-10-30", priority: "high", tags: ["email"] });
  expect(tasks![0].description).toContain("#all/msg-invoice");

  // A second refresh downloads and analyses nothing new.
  const googleBefore = await getJson(`${GOOGLE}/__state`);
  await card.getByRole("button", { name: "Refresh email" }).click();
  await toast(page, "Gmail synced: 0 new emails");
  const googleAfter = await getJson(`${GOOGLE}/__state`);
  expect(googleAfter.stats.messagesGet).toBe(googleBefore.stats.messagesGet);
  const claudeAfter = await getJson(`${CLAUDE}/__stats`);
  expect(claudeAfter.analysis - claudeBefore.analysis).toBe(1); // one batch, first sync only
  expect(claudeAfter.analysisWithTools).toBe(0);
  expect(errors).toEqual([]);
});

test("an email that hijacks the model still can't act on its own", async ({ page }) => {
  await connect(page);
  const card = emailCard(page);
  await card.getByRole("button", { name: "Refresh email" }).click();
  await toast(page, "Gmail synced");

  // The fake model was fooled (it rates the phishing email critical and
  // suggests wiring money) — yet nothing happened without the user:
  const phish = card.locator("li", { hasText: "URGENT: verify your account" });
  await expect(phish).toContainText("Critical");
  expect((await adminClient().from("tasks").select("id").eq("user_id", uid)).data).toHaveLength(0);
  // Analysis requests offered no tools, and Gmail was only ever read.
  expect((await getJson(`${CLAUDE}/__stats`)).analysisWithTools).toBe(0);
  // The deadline "by tomorrow" is quoted from the email, so the user can judge it.
  await expect(phish).toContainText("the email says “by tomorrow”");
  // Creating the task would still need explicit confirmation.
  await phish.getByRole("button", { name: /Task: Wire \$5,000/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Create this task?");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  expect((await adminClient().from("tasks").select("id").eq("user_id", uid)).data).toHaveLength(0);
});

test("declined consent, missing scope, and forged state never connect", async ({ page }) => {
  await setConsent("deny");
  await page.goto("/");
  await emailCard(page).getByRole("button", { name: "Connect Gmail" }).click();
  await toast(page, "access was declined");

  await setConsent("no_scope");
  await emailCard(page).getByRole("button", { name: "Connect Gmail" }).click();
  await toast(page, "permission to read email wasn't granted");

  // A callback with a state this browser never issued is refused.
  const before = (await getJson(`${GOOGLE}/__state`)).stats.tokenExchanges;
  await page.goto("/api/gmail/callback?code=stolen-code&state=forged");
  await toast(page, "couldn't be verified");
  expect((await getJson(`${GOOGLE}/__state`)).stats.tokenExchanges).toBe(before); // code never used
  expect((await adminClient().from("gmail_connections").select("user_id").eq("user_id", uid)).data).toHaveLength(0);
});

test("revoked access asks to reconnect; disconnect revokes and deletes stored email", async ({ page }) => {
  await connect(page);
  const card = emailCard(page);
  await card.getByRole("button", { name: "Refresh email" }).click();
  await toast(page, "Gmail synced");

  // The user removes access in their Google account.
  await fetch(`${GOOGLE}/__revoke_all`, { method: "POST" });
  await page.reload();
  await card.getByRole("button", { name: "Refresh email" }).click();
  await toast(page, "expired or was revoked");
  await expect(card.getByRole("button", { name: "Reconnect Gmail" })).toBeVisible();
  await expect(card).toContainText("previously synced emails are still shown");

  // Reconnect works.
  await card.getByRole("button", { name: "Reconnect Gmail" }).click();
  await toast(page, "Gmail connected");
  await expect(card.getByRole("button", { name: "Refresh email" })).toBeVisible();

  // Disconnect from Settings.
  const revokedBefore = (await getJson(`${GOOGLE}/__state`)).revokedCount;
  await page.goto("/settings");
  await expect(page.getByText("Connected as")).toContainText("me@gmail.test");
  await page.getByRole("button", { name: "Disconnect Gmail" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
  await toast(page, "Gmail disconnected and access revoked");
  expect((await getJson(`${GOOGLE}/__state`)).revokedCount).toBe(revokedBefore + 1);
  for (const t of ["gmail_connections", "email_messages"] as const) {
    expect((await adminClient().from(t).select("user_id").eq("user_id", uid)).data).toHaveLength(0);
  }
  await page.goto("/");
  await expect(emailCard(page).getByRole("button", { name: "Connect Gmail" })).toBeVisible();
});

test("the sync endpoint refuses cross-site and signed-out requests", async ({ request, playwright, baseURL }) => {
  const cross = await request.post("/api/gmail/sync", { headers: { origin: "https://evil.example" } });
  expect(cross.status()).toBe(403);
  const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  expect((await anon.post("/api/gmail/sync", { headers: { origin: baseURL! } })).status()).toBe(401);
  await anon.dispose();
});

test("the populated card is accessible in both themes and fits a phone screen", async ({ page }) => {
  await connect(page);
  await emailCard(page).getByRole("button", { name: "Refresh email" }).click();
  await toast(page, "Gmail synced");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload();
    await expect(emailCard(page)).toContainText("Invoice #1042");
    const results = await new AxeBuilder({ page }).include("[data-testid=email-intelligence]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${scheme}: ${v.id} — ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} [${n.failureSummary?.split("\n").slice(1).join(" ").trim()}]`).join(" | ")}`)).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(emailCard(page)).toContainText("Invoice #1042");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
