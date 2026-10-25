import { expect, test } from "@playwright/test";

import { USER } from "./helpers";

test.describe("signing in and out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signed-out visitors are sent to the login page and API calls get 401", async ({ page, request }) => {
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/login\?next=%2Ftasks$/);
    const res = await request.post("/api/companion/chat", { data: { message: "hi" } });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "Please sign in again." });
  });

  test("wrong password shows an error and keeps the email; right password signs in and returns to the page", async ({ page }) => {
    await page.goto("/login?next=%2Fgoals");
    await page.getByLabel("Email").fill(USER.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("form-error")).toHaveText("Incorrect email or password.");
    await expect(page.getByLabel("Email")).toHaveValue(USER.email);

    await page.getByLabel("Password").fill(USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/goals$/);

    await page.locator("aside").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});
