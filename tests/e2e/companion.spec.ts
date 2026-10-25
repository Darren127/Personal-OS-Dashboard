/**
 * The AI Companion through the real SDK, streaming, and UI — answered by the
 * test-only mock API in mock-anthropic.mjs, so no real key or cost is involved.
 */
import { expect, test } from "@playwright/test";

import { adminClient, resetUser, toast, trackErrors } from "./helpers";

let uid: string;
test.beforeEach(async () => {
  uid = await resetUser();
});

test("chat streams, queues an action for approval, and approving runs it once", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/companion");
  await expect(page.getByText("How can I help?")).toBeVisible();
  const box = page.getByLabel("Message the AI Companion");
  await box.fill("Add a task to call the bank");
  await box.press("Enter");

  await expect(page.getByText("waiting for your approval")).toBeVisible();
  await expect(page).toHaveURL(/companion\?c=[0-9a-f-]{36}$/);
  await expect(page.getByText("Checking what's overdue")).toBeVisible();
  await expect(page.getByText("Searched your tasks")).toBeVisible();
  await expect(page.getByText("Needs your approval")).toBeVisible();
  expect((await adminClient().from("tasks").select("id").eq("user_id", uid)).data).toHaveLength(0);

  // The transcript survives a reload (it's stored, not just streamed)
  await page.reload();
  await page.getByRole("button", { name: "Approve" }).click();
  await toast(page, "Approved and done");
  await expect(page.getByText("Done", { exact: true }).first()).toBeVisible();
  const tasks = (await adminClient().from("tasks").select("title").eq("user_id", uid)).data;
  expect(tasks).toEqual([{ title: "Call the bank about the mortgage rate" }]);

  // A second request in the same conversation, rejected this time
  await box.fill("Add the bank call again");
  await box.press("Enter");
  await expect(page.getByText("Needs your approval")).toBeVisible();
  await page.getByRole("button", { name: "Reject" }).click();
  await toast(page, "Rejected");
  expect((await adminClient().from("tasks").select("id").eq("user_id", uid)).data).toHaveLength(1);

  // The action log records both decisions
  await page.goto("/companion/actions?show=all");
  await expect(page.locator("main ul > li")).toHaveCount(2);
  await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("AI-suggested memories wait for review", async ({ page }) => {
  await page.goto("/companion");
  await page.getByLabel("Message the AI Companion").fill("Please remember that I do my best work before noon");
  await page.getByLabel("Message the AI Companion").press("Enter");
  await expect(page.getByText("Waiting in Memory")).toBeVisible();

  await page.goto("/companion/memory");
  await expect(page.getByText("Waiting for your review")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await toast(page, "Memory approved");
  await expect(page.getByRole("heading", { name: "Working style" })).toBeVisible();
  const mem = (await adminClient().from("memories").select("status, created_by").eq("user_id", uid)).data;
  expect(mem).toEqual([{ status: "approved", created_by: "ai" }]);
});

test("quick prompts pre-fill and settings control auto-run", async ({ page }) => {
  await page.goto("/companion?prompt=weekly");
  await expect(page.getByLabel("Message the AI Companion")).toHaveValue(/^Let's do my weekly review/);

  await page.goto("/settings");
  const toggle = page.getByLabel("Let the AI make low-risk changes without asking");
  await toggle.click();
  await toast(page, "without asking");
  await page.reload();
  await expect(toggle).toHaveAttribute("data-state", "checked");
});
