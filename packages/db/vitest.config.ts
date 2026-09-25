import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./src/test/test-db.ts";

// Two projects, run with `--project unit` or `--project integration`
// (package.json's `test`/`test:integration` scripts do this for you):
//
// - `unit`: pure functions, zero I/O, no setup required. This is the
//   "blazingly fast" inner loop — `pnpm test:watch` re-runs only the
//   test files affected by whatever you just saved.
// - `integration`: real queries against a real Postgres (`app_test`,
//   never your dev database — see src/test/test-db.ts). Needs
//   `pnpm db:test:setup` once before these will pass. Runs sequentially
//   (`fileParallelism: false`) because every test file shares one
//   database and resets it in a `beforeEach` — parallel files would
//   stomp on each other's data.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          setupFiles: ["./src/test/setup-integration.ts"],
          fileParallelism: false,
          env: { DATABASE_URL: TEST_DATABASE_URL },
        },
      },
    ],
  },
});
