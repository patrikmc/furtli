import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// Playwright's own CLI process doesn't get Next.js's automatic .env.local
// loading (that only happens inside the `next build`/`next start` process
// this config's webServer spawns) — load it explicitly here so
// CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY / E2E_CLERK_USER_EMAIL /
// DATABASE_URL are all one file to fill in, not two.
loadEnv({ path: ".env.local" });

// E2E: a real Chromium driving the real running app. This is the
// expensive, slow layer of the test pyramid on purpose — see
// docs/TESTING.md for why it's scoped to a couple of critical paths
// instead of broad coverage, and for the one-time Clerk test-instance
// setup this needs before `pnpm test:e2e` will do anything but fail on
// missing credentials.
//
// Needs, at minimum (see .env.example):
//   CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY   — a Clerk *test* instance's
//     keys (same values as NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY
//     in apps/web/.env.local, just also exposed under these unprefixed
//     names — that's the name @clerk/testing's helpers look for)
//   E2E_CLERK_USER_EMAIL                       — a test user's email
//     ending in "+clerk_test@..." (Clerk's reserved testing-mode address
//     that always passes verification, no real inbox needed)
//   DATABASE_URL pointed at a Postgres with `pnpm db:seed` already run
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "on-failure" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
