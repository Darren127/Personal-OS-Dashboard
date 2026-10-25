import { expect, test } from "@playwright/test";

import { adminClient, resetUser, toast, trackErrors } from "./helpers";

test.beforeEach(async () => {
  const id = await resetUser();
  await adminClient().from("projects").insert({ user_id: id, name: "Website relaunch", status: "active" });
});

test("create, validate, edit, complete, filter, search, and delete tasks", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/tasks");
  await expect(page.getByText("No open tasks")).toBeVisible();

  // Quick add
  await page.getByLabel("New task title").fill("Buy groceries");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await toast(page, "Added to Inbox");
  await expect(page.getByLabel("New task title")).toHaveValue("");
  await page.getByLabel("New task title").fill("Write weekly report");
  await page.getByLabel("Due today").check();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await toast(page, "Added to today");

  // Detailed task: a validation error keeps what was typed
  await page.getByRole("button", { name: "Detailed task" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Launch landing page");
  await dialog.getByLabel("Priority").selectOption("critical");
  await dialog.getByLabel("Start date").fill("2030-11-10");
  await dialog.getByLabel("Due date").fill("2030-11-01");
  await dialog.getByLabel("Project").selectOption({ label: "Website relaunch" });
  await dialog.getByLabel("Tags").fill("Deep Work, marketing");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog.getByText("Due date can't be before the start date.")).toBeVisible();
  await expect(dialog.getByLabel("Title")).toHaveValue("Launch landing page");
  await dialog.getByLabel("Due date").fill("2030-11-20");
  await dialog.getByLabel("Scheduled time").fill("2030-11-12T09:30");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await toast(page, "Task created");
  const row = page.locator("li", { has: page.getByRole("button", { name: "Launch landing page", exact: true }) });
  await expect(row).toContainText("Website relaunch");
  await expect(row).toContainText("#deep-work");

  // Edit: values round-trip, including the timezone-aware scheduled time
  await page.getByRole("button", { name: "Launch landing page", exact: true }).click();
  await expect(dialog.getByLabel("Scheduled time")).toHaveValue("2030-11-12T09:30");
  await dialog.getByLabel("Status").selectOption("in_progress");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await toast(page, "Task saved");

  // Complete with the checkbox: it leaves the open list
  await page.getByRole("checkbox", { name: 'Mark "Buy groceries" as done' }).click();
  await expect(page.getByRole("button", { name: "Buy groceries", exact: true })).toHaveCount(0);

  // Filters (changed quickly one after another) and search
  await page.getByLabel("Filter by status").selectOption("done");
  await expect(page.getByRole("button", { name: "Buy groceries", exact: true })).toBeVisible();
  await page.getByLabel("Filter by status").selectOption("");
  await page.getByLabel("Filter by priority").selectOption("critical");
  await expect(page).toHaveURL(/priority=critical/);
  await expect(page).not.toHaveURL(/status=/);
  await expect(page.locator("main li button.text-left")).toHaveText(["Launch landing page"]);
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByLabel("Search tasks").fill("report");
  await expect(page.locator("main li button.text-left")).toHaveText(["Write weekly report"]);
  await page.goto("/tasks?q=zzzz");
  await expect(page.getByText("No tasks match these filters")).toBeVisible();

  // Delete with confirmation
  await page.goto("/tasks");
  await page.getByRole("button", { name: 'Actions for "Write weekly report"' }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await toast(page, "Task deleted");
  await expect(page.locator("main li button.text-left")).toHaveText(["Launch landing page"]);

  expect(errors).toEqual([]);
});
