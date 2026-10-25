import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a production build and the local Supabase stack.
 *
 *   npm run db:start        # local database (once)
 *   npm run test:e2e        # builds, starts the app + a test-only mock Claude API, runs the suite
 *
 * Tests share one test user, so they run one at a time.
 */
const APP_PORT = 3100;
const MOCK_PORT = 4100;
const MOCK_KEY = "sk-ant-e2e-mock-key";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    storageState: "tests/e2e/.auth/user.json",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    // Use the Chromium already installed in this environment when present.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } }],
  webServer: [
    {
      command: `node tests/e2e/mock-anthropic.mjs`,
      port: MOCK_PORT,
      env: { MOCK_ANTHROPIC_PORT: String(MOCK_PORT), MOCK_EXPECTED_KEY: MOCK_KEY },
      reuseExistingServer: false,
    },
    {
      command: `npm run start -- -p ${APP_PORT}`,
      port: APP_PORT,
      env: {
        ANTHROPIC_API_KEY: MOCK_KEY,
        PERSONAL_OS_ANTHROPIC_BASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
