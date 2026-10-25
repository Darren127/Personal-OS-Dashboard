import { expect, test } from "@playwright/test";

import { adminClient, card, daysFromToday, resetUser, toast, today, trackErrors } from "./helpers";

let uid: string;

test.beforeEach(async () => {
  uid = await resetUser();
  const t = today();
  const { error } = await adminClient().from("tasks").insert([
    { user_id: uid, title: "Draft Q4 budget", status: "next", priority: "high", due_date: t, estimated_minutes: 240 },
    { user_id: uid, title: "Reply to landlord", status: "next", priority: "medium", due_date: t, estimated_minutes: 15 },
    { user_id: uid, title: "Prepare client pitch deck", status: "in_progress", priority: "critical", due_date: t, estimated_minutes: 300 },
    { user_id: uid, title: "Clean up photo library", status: "next", priority: "low", due_date: t, estimated_minutes: 120 },
    { user_id: uid, title: "Renew passport", status: "next", priority: "high", due_date: daysFromToday(-4), estimated_minutes: 45 },
    { user_id: uid, title: "Book dentist", status: "inbox", priority: "low", due_date: daysFromToday(-2) },
    { user_id: uid, title: "Submit tax documents", status: "next", priority: "high", due_date: daysFromToday(4), estimated_minutes: 60 },
  ]);
  if (error) throw error;
});

test("plan the day: capacity, priorities, overdue, time blocks, notes, and review", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)\.$/);
  await expect(page.getByText("0 of 4 done")).toBeVisible();

  // Over capacity: 240 + 15 + 300 + 120 = 11h 15m against 8h 30m
  const worth = page.locator("section[aria-labelledby=worth-a-look]");
  await expect(worth.locator("li").first()).toContainText("Today is 2h 45m over capacity");
  // Nothing is a top priority yet, so the lowest-priority tasks that aren't critical or in progress can move
  await expect(worth.locator("li").first()).toContainText('Moving "Clean up photo library", "Reply to landlord", "Draft Q4 budget" frees 6h 15m and makes the day fit');

  // Top three priorities (picker and task menu)
  await page.getByLabel("Choose a task to prioritise").selectOption({ label: "Prepare client pitch deck · Today" });
  await page.getByRole("button", { name: "Add priority" }).click();
  await toast(page, "priority #1");
  await page.getByRole("button", { name: 'Actions for "Draft Q4 budget"' }).first().click();
  await page.getByRole("menuitem", { name: "Add to top 3" }).click();
  await toast(page, "priority #2");

  // Overdue: do it today (counts as a reschedule)
  await page.getByRole("button", { name: 'Actions for "Book dentist"' }).click();
  await page.getByRole("menuitem", { name: "Do it today" }).click();
  await toast(page, "Moved to today");
  await expect(card(page, "Overdue").locator("li button.text-left")).toHaveText(["Renew passport"]);

  // Time blocks: validation, then an overlap warning
  const schedule = card(page, "Schedule");
  await schedule.getByRole("button", { name: "Add time block" }).click();
  await schedule.getByLabel("Start time").fill("10:30");
  await schedule.getByLabel("End time").fill("10:00");
  await schedule.getByRole("button", { name: "Add block" }).click();
  await expect(schedule.getByText("Pick a task or name the block")).toBeVisible();
  await expect(schedule.getByText("End time must be after the start time.")).toBeVisible();
  await schedule.getByLabel("Task for this block").selectOption({ label: "Prepare client pitch deck" });
  await schedule.getByLabel("Start time").fill("09:00");
  await schedule.getByLabel("End time").fill("11:00");
  await schedule.getByRole("button", { name: "Add block" }).click();
  await toast(page, "Time block added");
  await schedule.getByRole("button", { name: "Add time block" }).click();
  await schedule.getByLabel("Block name").fill("Team standup");
  await schedule.getByLabel("Start time").fill("10:30");
  await schedule.getByLabel("End time").fill("11:15");
  await schedule.getByRole("button", { name: "Add block" }).click();
  await expect(schedule.getByText("Some blocks overlap")).toBeVisible();

  // Complete one: progress updates
  await page.getByRole("checkbox", { name: 'Mark "Reply to landlord" as done' }).click();
  await expect(page.getByText(/1 of \d done/)).toBeVisible();

  // Notes and the end-of-day review
  await page.getByLabel("Today's intention").fill("Finish the pitch before lunch");
  await page.getByRole("button", { name: "Save notes" }).click();
  await toast(page, "Notes saved");
  await expect(page.getByText("Intention: Finish the pitch before lunch")).toBeVisible();
  await page.getByRole("button", { name: "Save review" }).click();
  await toast(page, "at least one");
  await page.getByLabel("What went well?").fill("Pitch deck structure is done.");
  await page.getByLabel("Energy").selectOption("3");
  await page.getByRole("button", { name: "Save review" }).click();
  await toast(page, "Review saved");

  // Outcomes are recorded from each planned task's real state
  const { data } = await adminClient().from("daily_plan_items").select("outcome, task:tasks(title)").eq("user_id", uid).not("task_id", "is", null);
  const outcomes = Object.fromEntries(data!.map((i) => [i.task!.title, i.outcome]));
  expect(outcomes).toMatchObject({ "Prepare client pitch deck": "partial", "Draft Q4 budget": "skipped" });
  const dentist = await adminClient().from("tasks").select("due_date, reschedule_count").eq("user_id", uid).eq("title", "Book dentist").single();
  expect(dentist.data).toEqual({ due_date: today(), reschedule_count: 1 });

  expect(errors).toEqual([]);
});

test("an overloaded day can be fixed with one click, keeping top priorities", async ({ page }) => {
  const admin = adminClient();
  const { data: plan } = await admin.from("daily_plans").insert({ user_id: uid, plan_date: today() }).select("id").single();
  const { data: budget } = await admin.from("tasks").select("id").eq("user_id", uid).eq("title", "Draft Q4 budget").single();
  await admin.from("daily_plan_items").insert({ user_id: uid, plan_id: plan!.id, task_id: budget!.id, priority_rank: 1 });

  await page.goto("/");
  const overload = page.locator("section[aria-labelledby=worth-a-look] li", { hasText: "over capacity" });
  await expect(overload).toContainText("you'd still be 30m over — one of your top priorities may need to wait");
  await overload.getByRole("button", { name: "Move 2 tasks to tomorrow" }).click();
  await toast(page, "Moved 2 tasks");
  await expect(overload).toContainText("Today is 30m over capacity");
  const moved = await adminClient().from("tasks").select("title, due_date").eq("user_id", uid).eq("due_date", daysFromToday(1)).order("title");
  expect(moved.data!.map((t) => t.title)).toEqual(["Clean up photo library", "Reply to landlord"]);
});
