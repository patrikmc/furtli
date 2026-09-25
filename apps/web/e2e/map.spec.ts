import { expect, test } from "./fixtures";

test("map loads with brand, sample-data badge and filter chips", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.getByText("Karte lädt")).toBeHidden();
  await expect(page.getByTestId("sample-badge")).toBeVisible();
  await expect(page.getByRole("button", { name: /Recyclinghof/ })).toHaveAttribute("aria-pressed", "true");
  // A6: attribution always visible
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("Stadt Zürich");
});

test("deep link opens a station; tapping the marker reopens it; filter hides it", async ({ page }) => {
  await page.goto("/?station=mrh-stauffacher");
  const sheet = page.getByTestId("station-sheet");
  await expect(sheet).toContainText("Stauffacher");
  await expect(sheet.getByRole("link", { name: /Wir bringen/ })).toBeVisible();

  // Map is centred on the station at zoom 15, so the marker sits at the canvas centre.
  await page.getByRole("button", { name: "Schliessen" }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/$/);

  const canvas = page.locator(".maplibregl-canvas");
  const box = (await canvas.boundingBox())!;
  const centre = { x: box.width / 2, y: box.height / 2 };

  await page.waitForTimeout(300); // let the symbol layer settle after jumpTo
  await canvas.click({ position: centre });
  await expect(sheet).toContainText("Stauffacher");
  await expect(page).toHaveURL(/station=mrh-stauffacher/);
  await expect(page).toHaveURL(/kreis=4/);

  // Hide Recyclinghof stops: the same tap now selects Kreis 4 instead.
  await page.getByRole("button", { name: "Schliessen" }).click();
  await page.getByRole("button", { name: /Recyclinghof/ }).click();
  await page.waitForTimeout(300);
  await canvas.click({ position: centre });
  await expect(page.getByRole("dialog", { name: "Kreis 4" })).toBeVisible();
});

test("geolocation denied keeps the map working and shows a hint", async ({ page }) => {
  // Simulate the user tapping "Block" on the permission prompt.
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, err) =>
      err?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "denied" } as GeolocationPositionError);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Meinen Standort verwenden" }).click();
  await expect(page.getByRole("status")).toContainText(/Standort/);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
});

test("geolocation in Kreis 5 highlights and opens Kreis 5", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 47.3868, longitude: 8.5215 }); // Escher-Wyss-Platz
  await page.goto("/");
  await page.getByRole("button", { name: "Meinen Standort verwenden" }).click();
  await expect(page.getByRole("dialog", { name: "Kreis 5" })).toBeVisible();
  await expect(page).toHaveURL(/kreis=5/);
});
