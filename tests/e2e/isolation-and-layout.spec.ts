import { expect, test } from "@playwright/test";

import { OTHER_USER, adminClient, resetUser } from "./helpers";

const PAGES = ["/", "/tasks", "/goals", "/projects", "/companion", "/companion/memory", "/companion/actions", "/reviews", "/reviews/weekly", "/reviews/patterns", "/settings"];

test("another user sees none of this user's data", async ({ browser }) => {
  const uid = await resetUser();
  const { data: project } = await adminClient().from("projects").insert({ user_id: uid, name: "Private project", status: "active" }).select("id").single();
  await adminClient().from("tasks").insert({ user_id: uid, title: "Private task" });

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(OTHER_USER.email);
  await page.getByLabel("Password").fill(OTHER_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/$/);
  await page.goto("/tasks?status=all");
  await expect(page.getByText("0 tasks")).toBeVisible();
  await page.goto(`/projects/${project!.id}`);
  await expect(page.getByText("This item doesn't exist or was deleted.")).toBeVisible();
  await ctx.close();
});

test.describe("phone-sized screens", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no page scrolls sideways", async ({ page }) => {
    await resetUser();
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} is ${overflow}px too wide`).toBeLessThanOrEqual(0);
    }
  });

  test("the menu opens, navigates, and closes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Projects" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
