/**
 * Automated accessibility scan (axe-core, WCAG 2.1 A/AA rules) of every page,
 * in light and dark mode. Fails on any violation.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { adminClient, daysFromToday, resetUser, today } from "./helpers";

const PAGES = ["/", "/tasks", "/goals", "/projects", "/companion", "/companion/memory", "/companion/actions", "/reviews", "/reviews/weekly", "/reviews/patterns", "/settings"];

test.beforeAll(async () => {
  // Some content so pages render their real components, not just empty states.
  const uid = await resetUser();
  const admin = adminClient();
  await admin.from("tasks").insert([
    { user_id: uid, title: "Due today task", due_date: today(), estimated_minutes: 600, priority: "high" },
    { user_id: uid, title: "Overdue task", due_date: daysFromToday(-5), priority: "low" },
  ]);
  await admin.from("goals").insert({ user_id: uid, title: "A goal", status: "active" });
  await admin.from("projects").insert({ user_id: uid, name: "A project", status: "active" });
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });
    for (const path of PAGES) {
      test(`${path} has no accessibility violations`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} [${n.failureSummary?.split("\n").slice(1).join(" ").trim()}]`).join(" | ")}`);
        expect(summary).toEqual([]);
      });
    }
  });
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("/login has no accessibility violations", async ({ page }) => {
    await page.goto("/login");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe("keyboard only", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("skip link, then add and complete a task without a mouse", async ({ page }) => {
    await resetUser();
    await page.goto("/tasks");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();

    // Tab forward until the quick-add box has focus
    const quickAdd = page.getByLabel("New task title");
    for (let i = 0; i < 15 && !(await quickAdd.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(quickAdd).toBeFocused();
    await page.keyboard.type("Keyboard-only task");
    await page.keyboard.press("Enter");
    const done = page.getByRole("checkbox", { name: 'Mark "Keyboard-only task" as done' });
    await expect(done).toBeVisible();
    await done.focus();
    await page.keyboard.press("Space");
    await expect(done).toHaveCount(0); // completed tasks leave the open list

    // Dialogs trap focus and close on Escape
    await page.getByRole("button", { name: "Detailed task" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
