import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

// Runs once before the "chromium" project (see playwright.config.ts's
// `dependencies: ["setup"]"). clerkSetup() talks to Clerk's API using
// CLERK_PUBLISHABLE_KEY/CLERK_SECRET_KEY to obtain a Testing Token,
// which is what lets clerk.signIn() (used in the specs below) bypass
// Clerk's bot detection without that looking like a real attack.
setup.describe.configure({ mode: "serial" });

setup("global setup", async () => {
  await clerkSetup();
});
