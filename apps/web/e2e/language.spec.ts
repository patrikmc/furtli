import { expect, test } from "./fixtures";

// Site language: German by default, DE/EN toggle, ?lang= links (from emails).

test("the toggle switches the map to English and the choice sticks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("start-card")).toContainText("Was gibt's in deiner Nähe?");
  await expect(page.locator("html")).toHaveAttribute("lang", "de-CH");

  const toggle = page.getByTestId("lang-toggle");
  await toggle.getByRole("button", { name: "English" }).click();
  await expect(page.getByTestId("start-card")).toContainText("What's near you?");
  await expect(page.getByRole("button", { name: "Mobile recycling", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.reload();
  await expect(page.getByTestId("start-card")).toContainText("What's near you?");
  await expect(page).toHaveTitle(/Recycling in Zurich/);

  // Postcode search in English, then the subscribe form defaults to English emails.
  await page.getByTestId("start-card").getByRole("combobox", { name: "Choose a postcode" }).selectOption("8004");
  const panel = page.getByRole("dialog", { name: "Postcode 8004" });
  await expect(panel.getByRole("tab", { name: /Places/ })).toBeVisible();
  await panel.getByTestId("subscribe-open").click();
  await expect(panel.getByRole("combobox", { name: "Email language" })).toHaveValue("en");
});

test("a ?lang= link (e.g. from an English email) sets the language", async ({ page }) => {
  await page.goto("/abo/fertig?s=confirmed&lang=en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You're in");
  await page.getByRole("link", { name: "← To the map" }).click();
  await expect(page.getByTestId("start-card")).toContainText("What's near you?");

  await page.goto("/abholen?lang=de");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wir bringen's hin.");
});
