import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";
 
// Signed-in browsing: needs `pnpm db:seed` to have loaded content/quizzes/*.yaml.
 
test.beforeEach(async ({ page }) => {
  await signIn(page);
});
 
test("overview lists the seeded quizzes", async ({ page }) => {
  await page.goto("/quizzes");
  await expect(page.getByRole("heading", { level: 1, name: "Quizzes" })).toBeVisible();
  for (const title of ["World Capitals", "Composer Nationalities", "What Decade Were They Born?"]) {
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
  }
});
 
test("quiz detail page shows the question count and a start button", async ({ page }) => {
  await page.goto("/quizzes");
  await page.getByRole("link", { name: /World Capitals/ }).click();
 
  await expect(page).toHaveURL(/\/quizzes\/world-capitals$/);
  await expect(page.getByRole("heading", { level: 1, name: "World Capitals" })).toBeVisible();
  await expect(page.getByText(/^\d+ questions?$/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Start quiz|Retake quiz/ })).toBeVisible();
});
 
test("an unknown quiz slug shows a not-found page", async ({ page }) => {
  await page.goto("/quizzes/this-quiz-does-not-exist");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});