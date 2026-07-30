import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";
import { requireDisposableE2eDatabase } from "./scripts/testing/e2e-database";

requireDisposableE2eDatabase();
const playwrightPort = Number(process.env.PLAYWRIGHT_PORT ?? "3000");
if (!Number.isInteger(playwrightPort) || playwrightPort < 1 || playwrightPort > 65535) {
  throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535");
}
const playwrightOrigin = `http://127.0.0.1:${playwrightPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: "test-results/playwright-artifacts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "test-results/playwright-report" }],
    ["json", { outputFile: "test-results/playwright-results.json" }],
  ],
  use: {
    baseURL: playwrightOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "node scripts/testing/e2e-standalone.mjs",
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    name: "next-standalone",
    stderr: "pipe",
    stdout: "pipe",
    timeout: 10 * 60_000,
    url: `${playwrightOrigin}/workspace/login`,
    reuseExistingServer: false,
  },
});
