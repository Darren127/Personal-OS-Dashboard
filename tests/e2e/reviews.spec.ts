import { expect, test } from "@playwright/test";

import { adminClient, daysFromToday, resetUser, toast } from "./helpers";

let uid: string;
test.beforeEach(async () => {
  uid = await resetUser();
});

test("patterns show evidence and can be hidden", async ({ page }) => {
  const admin = adminClient();
  const { data: task } = await admin.from("tasks")
    .insert({ user_id: uid, title: "Write blog post", due_date: daysFromToday(-12) }).select("id").single();
  for (const d of [-9, -6, -3]) await admin.from("tasks").update({ due_date: daysFromToday(d) }).eq("id", task!.id);

  await page.goto("/reviews/patterns");
  const finding = page.locator("main li", { hasText: "pushed back 3 times" });
  await expect(finding).toContainText("Rescheduling it again is unlikely to help");
  await expect(page.locator("main li", { hasText: "overdue by two days or more" })).toContainText('"Write blog post" (3 days)');

  await finding.getByRole("button", { name: /^Hide/ }).click();
  await page.getByRole("menuitem", { name: "Hide for a week" }).click();
  await toast(page, "Hidden for a week");
  await expect(finding).toHaveCount(0);
  await expect(page.getByText("1 hidden.")).toBeVisible();

  // Ask-AI pre-fills the Companion without sending
  await page.locator("main li", { hasText: "overdue" }).getByRole("link", { name: "Decide with AI" }).click();
  await expect(page.getByLabel("Message the AI Companion")).toHaveValue(/overdue tasks/);
});

test("weekly review: numbers, reflection, history, navigation", async ({ page }) => {
  await page.goto("/reviews/weekly");
  await expect(page.locator("main h2").first()).toContainText("this week");
  await page.getByLabel("What went well this week?").fill("Shipped the pitch.");
  await page.getByLabel("Next week's main focus").fill("Protect mornings");
  await page.getByLabel("How did the week go overall?").selectOption("4");
  await page.getByRole("button", { name: "Save weekly review" }).click();
  await toast(page, "Weekly review saved");
  await expect(page.getByRole("button", { name: "Update weekly review" })).toBeVisible();
  await expect(page.locator("main section", { hasText: "Past weekly reviews" })).toContainText("rated 4/5");

  await page.getByRole("link", { name: "Previous week" }).click();
  await expect(page.getByLabel("What went well this week?")).toHaveValue("");
  const saved = await adminClient().from("weekly_reviews").select("wins, rating, stats").eq("user_id", uid).single();
  expect(saved.data).toMatchObject({ wins: "Shipped the pitch.", rating: 4 });
  expect(saved.data!.stats).toHaveProperty("tasks");
});
