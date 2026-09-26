import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "db/test/test-db";

// unit: parsers and matching against recorded Open Data Zürich samples.
// integration: the whole pipeline against a real Postgres (app_test), with
// the recorded samples standing in for the network. Needs
// `pnpm --filter db db:test:setup` once.
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
          setupFiles: ["db/test/setup-integration"],
          fileParallelism: false,
          env: { DATABASE_URL: TEST_DATABASE_URL },
        },
      },
    ],
  },
});
