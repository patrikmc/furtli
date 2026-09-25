
import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";
 
test.beforeEach(async ({ page }) => {
  await signIn(page);
});
 
test("next button stays disabled until a choice is selected", async ({ page }) => {
  await page.goto("/quizzes/composer-nationalities/play");
 
  await expect(page.getByText(/^Question 1 of \d+$/)).toBeVisible();
  const next = page.getByRole("button", { name: /next question/i });
  await expect(next).toBeDisabled();
 
  const firstChoice = page.getByTestId("quiz-choice").first();
  await firstChoice.click();
  await expect(firstChoice).toHaveAttribute("aria-pressed", "true");
  await expect(next).toBeEnabled();
 
  await next.click();
  await expect(page.getByText(/^Question 2 of \d+$/)).toBeVisible();
});
 
test("a completed attempt shows up on the profile page", async ({ page }) => {
  await page.goto("/quizzes/decade-born/play");
 
  const finish = page.getByRole("button", { name: /finish quiz/i });
  const next = page.getByRole("button", { name: /next question/i });
  for (let guard = 0; guard < 50; guard += 1) {
    await page.getByTestId("quiz-choice").first().click();
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await next.click();
  }
 
  await expect(page).toHaveURL(/\/quizzes\/decade-born\/attempts\/[\w-]+$/);
  await expect(page.getByRole("heading", { name: "Question breakdown" })).toBeVisible();
 
  await page.getByRole("link", { name: "View your profile" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("link", { name: /What Decade Were They Born\?/ })).toBeVisible();
});