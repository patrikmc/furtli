import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
 
// Signed-out behaviour: what an anonymous visitor sees, and that the
// protected routes in proxy.ts really are protected.
 
test.beforeEach(async ({ page }) => {
  await setupClerkTestingToken({ page });
});
 
test("landing page shows the app name and sign-in/sign-up actions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Quiz Night" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeVisible();
});
 
for (const path of ["/quizzes", "/profile", "/admin"]) {
  test(`${path} redirects signed-out visitors to sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  });
}
 