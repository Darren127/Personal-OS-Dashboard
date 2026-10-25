import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

import type { Database } from "../../src/lib/supabase/database.types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // In CI the variables come from the environment.
}

export const USER = { email: "e2e@personal-os.local", password: "e2e-test-password-1" };
export const OTHER_USER = { email: "e2e-other@personal-os.local", password: "e2e-test-password-2" };

export function adminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("E2E tests need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example).");
  return createClient<Database>(url, secret, { auth: { persistSession: false } });
}

export async function userId(email = USER.email) {
  const { data, error } = await adminClient().auth.admin.listUsers();
  if (error) throw error;
  const u = data.users.find((x) => x.email === email);
  if (!u) throw new Error(`Test user ${email} not found — global setup should create it.`);
  return u.id;
}

/** Today's date in UTC (the test users' timezone), as YYYY-MM-DD. */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function daysFromToday(n: number) {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const USER_TABLES = [
  "ai_action_logs", "conversations", "memories", "tasks", "goals", "projects",
  "daily_plans", "daily_reviews", "weekly_reviews", "finding_dismissals",
] as const;

/** Delete all of a test user's data and restore default preferences. */
export async function resetUser(email = USER.email) {
  const admin = adminClient();
  const id = await userId(email);
  for (const t of USER_TABLES) {
    const { error } = await admin.from(t).delete().eq("user_id", id);
    if (error) throw new Error(`reset ${t}: ${error.message}`);
  }
  await admin.from("user_preferences").upsert({
    user_id: id, timezone: "UTC", display_name: null, work_day_start: "09:00", work_day_end: "17:30",
    week_starts_on: 1, ai_auto_execute_low_risk: false,
  });
  return id;
}

/** Wait for a toast containing `text` and return its text. */
export async function toast(page: Page, text: string | RegExp) {
  const t = page.locator("[data-sonner-toast]", { hasText: text }).first();
  await expect(t).toBeVisible();
  return t.innerText();
}

/** A card on the page, found by its title. */
export function card(page: Page, title: string | RegExp) {
  return page.locator("[data-slot=card]", { has: page.locator("[data-slot=card-title]", { hasText: title }) });
}

/** Fail on uncaught page errors and console errors. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}
