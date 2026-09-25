import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";
    
// The E2E user is deliberately NOT an admin (no {"role":"admin"} metadata).
// Admin routes must look like they don't exist.
 
test.beforeEach(async ({ page }) => {
  await signIn(page);
});
 
test("non-admins get a 404 on /admin and see no Admin link", async ({ page }) => {
  await page.goto("/quizzes");
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
 
  await page.goto("/admin");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});