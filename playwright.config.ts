import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    // Tests use real credentials: do not put request bodies or session tokens in traces.
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
});
