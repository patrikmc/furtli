import { test, expect } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

// The one critical-path E2E test this template ships: sign in, take a
// quiz end to end, land on a real results page. Deliberately doesn't
// assert an exact score — that would duplicate the quiz's answer key
// (content/quizzes/world-capitals.yaml) into the test, so any future
// content edit would break a test that has nothing to do with the bug
// being caught. What this test actually needs to prove is structural:
// auth works, the play flow submits, grading runs, a results page
// renders. Score correctness itself is packages/db's
// sync.integration.test.ts's job, one layer down, where it belongs.
test("sign in, complete a quiz, and reach a results page", async ({ page }) => {
  await setupClerkTestingToken({ page });

  await page.goto("/");
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_EMAIL!,
  });

  await page.goto("/quizzes/world-capitals/play");

  // Answer every question with whichever choice happens to be first,
  // until the button reads "Finish quiz" instead of "Next question".
  const finishButton = page.getByRole("button", { name: /finish quiz/i });
  const nextButton = page.getByRole("button", { name: /next question/i });

  for (let guard = 0; guard < 50; guard += 1) {
    await page.getByTestId("quiz-choice").first().click();

    if (await finishButton.isVisible()) {
      await finishButton.click();
      break;
    }
    await nextButton.click();
  }

  await expect(page).toHaveURL(/\/quizzes\/world-capitals\/attempts\/[\w-]+$/);
  await expect(page.getByText(/\d+%/).first()).toBeVisible();
});
