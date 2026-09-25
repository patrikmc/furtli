import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Component tests only — no Server Actions, no database, no network.
// `happy-dom` instead of `jsdom` as the DOM implementation: noticeably
// faster to spin up per test file, and this template's components don't
// need jsdom's closer (but slower) browser-API fidelity.
//
// Playwright's E2E suite (playwright.config.ts, e2e/) is deliberately
// separate from this config — different tool, different tradeoffs
// (real browser, real running app) — see docs/TESTING.md.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolves the "@/*" alias from tsconfig.json natively — no
    // vite-tsconfig-paths plugin needed as of Vite 8.
    tsconfigPaths: true,
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.tsx", "**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
