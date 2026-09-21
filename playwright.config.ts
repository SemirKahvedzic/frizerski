import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:3000";
const isCI = Boolean(process.env["CI"]);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: isCI ? "pnpm start" : "pnpm dev:web",
      url: `${baseURL}/api/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: "pnpm start:worker",
      url: `http://localhost:${process.env["WORKER_HEALTH_PORT"] ?? "3001"}/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
