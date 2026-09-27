import { defineConfig, devices } from "@playwright/test";

// E2E: a real browser driving the real (production-built) app. The base map
// style is stubbed in e2e/fixtures.ts, so these tests never depend on
// swisstopo being reachable — they test our layers, UI and URL state.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Optional: point at a preinstalled Chromium instead of `playwright install`.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH, args: ["--enable-unsafe-swiftshader"] } }
      : {}),
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    // The specs expect the 10 sample stations. An empty DATABASE_URL beats the
    // one in .env.local (Next never overrides a variable that is already set),
    // so /api/stations serves the seed file even if a local database is running.
    env: { DATABASE_URL: "" },
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
