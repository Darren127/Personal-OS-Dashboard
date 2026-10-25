import { expect, test } from "@playwright/test";

import { adminClient, card, daysFromToday, resetUser, toast, trackErrors } from "./helpers";

let uid: string;
test.beforeEach(async () => {
  uid = await resetUser();
  await adminClient().from("projects").insert({ user_id: uid, name: "Website relaunch", status: "active" });
});

test("a goal measured by a metric, then by milestones, with links and review notes", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Goal", { exact: true }).fill("Build a 6-month emergency fund");
  await d.getByLabel("Category").selectOption("finance");
  await d.getByLabel("Progress is calculated from").selectOption("metric");
  await d.getByLabel("Unit").fill("USD");
  await d.getByLabel("Target", { exact: true }).fill("12000");
  await d.getByRole("button", { name: "Create goal" }).click();
  await expect(d.getByText("Required for a metric.")).toHaveCount(2);
  await d.getByLabel("Start", { exact: true }).fill("0");
  await d.getByLabel("Current", { exact: true }).fill("3000");
  await d.getByRole("button", { name: "Create goal" }).click();
  await page.waitForURL(/\/goals\/[0-9a-f-]{36}$/);

  const progress = card(page, "Progress");
  await expect(progress.locator(".tabular-nums")).toHaveText("25%");
  await expect(progress).toContainText("3,000 USD — started at 0, target 12,000 USD");
  await page.getByLabel(/New measurement/).fill("4800");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(progress.locator(".tabular-nums")).toHaveText("40%");

  for (const t of ["Open account", "Automate transfer", "Reach 6,000", "Reach 12,000"]) {
    await page.getByLabel("New milestone title").fill(t);
    await page.locator("form", { has: page.getByLabel("New milestone title") }).getByRole("button", { name: "Add" }).click();
    // Wait for this milestone itself (an earlier toast may still be on screen).
    await expect(page.getByRole("checkbox", { name: `Mark milestone "${t}" as done` })).toBeVisible();
    await expect(page.getByLabel("New milestone title")).toHaveValue("");
  }
  await page.getByRole("checkbox", { name: 'Mark milestone "Open account" as done' }).click();
  await toast(page, "Milestone completed");
  await page.getByRole("button", { name: "Edit" }).click();
  await d.getByLabel("Progress is calculated from").selectOption("milestones");
  await d.getByRole("button", { name: "Save goal" }).click();
  await expect(progress).toContainText("1 of 4 milestones complete");

  await page.getByLabel("Choose a project to link").selectOption({ label: "Website relaunch" });
  await page.getByRole("button", { name: "Link project" }).click();
  await expect(card(page, "Projects")).toContainText("Website relaunch");
  await page.getByLabel("New review note").fill("On track; transfer still manual.");
  await page.getByRole("button", { name: "Add review note" }).click();
  await expect(card(page, "Review notes")).toContainText("progress was 25%");

  const notFound = await page.goto("/goals/00000000-0000-0000-0000-000000000000");
  expect(notFound).not.toBeNull();
  await expect(page.getByText("This item doesn't exist or was deleted.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a project's next action follows its state; deleting it keeps its tasks", async ({ page }) => {
  const errors = trackErrors(page);
  const next = page.locator("[data-slot=card]", { hasText: "Next recommended action" }).locator("p").nth(1);
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Project name").fill("Learn Spanish to B1");
  await d.getByLabel("Status").selectOption("active");
  await d.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(next).toHaveText("Define the first concrete task");

  await page.getByLabel("New milestone title").fill("Finish A2 course");
  await page.locator("form", { has: page.getByLabel("New milestone title") }).getByRole("button", { name: "Add" }).click();
  await expect(next).toHaveText('Plan the tasks for "Finish A2 course"');

  await page.getByRole("button", { name: "Detailed" }).click();
  await d.getByLabel("Title").fill("Book 10 lessons");
  await d.getByLabel("Project milestone").selectOption({ label: "Finish A2 course" });
  await d.getByLabel("Due date").fill(daysFromToday(-3));
  await d.getByRole("button", { name: "Create task" }).click();
  await expect(card(page, "Overdue")).toContainText("Book 10 lessons");
  await expect(next).toHaveText("Book 10 lessons");

  await page.getByLabel("New blocker").fill("Need to choose a tutor");
  await page.getByRole("button", { name: "Add blocker" }).click();
  await expect(next).toHaveText("Unblock: Need to choose a tutor");
  await card(page, "Blockers").getByRole("button", { name: "Resolved" }).click();
  await expect(next).toHaveText("Book 10 lessons");

  await page.getByRole("button", { name: "Delete project" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/projects$/);
  const kept = await adminClient().from("tasks").select("title, project_id").eq("user_id", uid);
  expect(kept.data).toEqual([{ title: "Book 10 lessons", project_id: null }]);
  expect(errors).toEqual([]);
});
