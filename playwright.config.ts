import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
export default defineConfig({
  timeout: 60000,
  // Cold Next.js development compilation and real local service mutations can
  // take longer than Playwright's default 5s; assertions still require success.
  expect: { timeout: 15000 },
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    },
  },
  webServer: {
    command: "npm run dev -- --port 4173",
    env: { APP_URL: "http://127.0.0.1:4173" },
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
