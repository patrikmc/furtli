import type { Page } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
 
/** Signs in the E2E test user (E2E_CLERK_USER_EMAIL) via Clerk's testing helpers. */
export async function signIn(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: process.env.E2E_CLERK_USER_EMAIL! });
}
 