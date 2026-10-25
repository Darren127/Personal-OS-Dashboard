import { chromium, type FullConfig } from "@playwright/test";

import { OTHER_USER, USER, adminClient, resetUser } from "./helpers";

/** Create the two test users (if needed), reset their data, and sign in once. */
export default async function globalSetup(config: FullConfig) {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw error;
  for (const u of [USER, OTHER_USER]) {
    if (!data.users.some((x) => x.email === u.email)) {
      const res = await admin.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
      if (res.error) throw res.error;
    }
    await resetUser(u.email);
  }

  const { baseURL, launchOptions } = config.projects[0].use;
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ timezoneId: "UTC" });
  await page.goto(`${baseURL}/login`);
  await page.fill("#email", USER.email);
  await page.fill("#password", USER.password);
  await page.click("button[type=submit]");
  await page.waitForURL(`${baseURL}/`);
  await page.context().storageState({ path: "tests/e2e/.auth/user.json" });
  await browser.close();
}
