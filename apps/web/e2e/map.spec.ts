import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Runs against the seed stations (no DATABASE_URL in the e2e server).

/** Where a centred point lands: the middle of the area the sheet/panel leaves free (MapShell's panelPadding). */
function focusPoint(w: number, h: number) {
  const p = w >= 768 ? { top: 110, left: 450, right: 60, bottom: 40 } : { top: 120, left: 20, right: 20, bottom: Math.round(h * 0.55) };
  return { x: p.left + (w - p.left - p.right) / 2, y: p.top + (h - p.top - p.bottom) / 2 };
}

async function mapCentre(page: Page) {
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByText("Karte lädt")).toBeHidden();
  const box = (await canvas.boundingBox())!;
  return { canvas, box, centre: { x: box.width / 2, y: box.height / 2 } };
}

test("map loads with brand, sample-data badge, four filter chips and the start card", async ({ page }) => {
  await page.goto("/");
  await mapCentre(page);
  await expect(page.getByTestId("sample-badge")).toBeVisible();
  for (const name of ["Mobiler Recyclinghof", "Sonderabfall", "Sammelstelle", "Recyclinghof"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByTestId("start-card")).toContainText("Was gibt's in deiner Nähe?");
  // A6: attribution always visible
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("Stadt Zürich");
});

test("tap any point on the map: nearby list grouped by distance, pin, shareable URL", async ({ page }) => {
  await page.goto("/");
  const { canvas, centre } = await mapCentre(page);
  // An empty spot east of the Hauptbahnhof (no station under the cursor).
  await canvas.click({ position: { x: centre.x + 60, y: centre.y - 60 } });

  const panel = page.getByRole("dialog", { name: "Gewählter Punkt" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/Kreis \d+/);
  await expect(page.getByTestId("search-pin")).toBeVisible();
  await expect(page).toHaveURL(/\?at=47\.\d{5}%2C8\.\d{5}$/);
  await expect(page.getByRole("radio", { name: "In der Nähe" })).toHaveAttribute("aria-checked", "true");

  // Widen to 2 km so the seed stations fall inside, then check the grouping.
  await page.getByRole("combobox", { name: "Umkreis" }).selectOption("2000");
  await expect(page).toHaveURL(/r=2000/);
  await page.getByRole("tab", { name: /Orte/ }).click();
  const groups = page.getByTestId("place-groups").getByRole("region");
  expect(await groups.count()).toBeGreaterThan(0);
  const labels = await groups.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(labels.every((l) => /m|km/.test(l ?? ""))).toBe(true);

  // Open a station from the list, then go back to the list.
  await page.getByTestId("place-groups").getByRole("button").first().click();
  await expect(page.getByTestId("station-sheet")).toContainText("entfernt");
  await page.getByRole("button", { name: "Zurück zur Liste" }).click();
  await expect(page.getByRole("dialog", { name: "Gewählter Punkt" })).toBeVisible();
});

test("the pin can be dragged to a new place", async ({ page, isMobile }) => {
  // Playwright can't synthesise a touch drag; MapLibre markers support touch dragging natively.
  test.skip(isMobile, "mouse drag only");
  await page.goto("/?at=47.37350,8.52870");
  await mapCentre(page);
  await expect(page.getByRole("dialog", { name: "Gewählter Punkt" })).toContainText("Kreis 4");
  const pin = page.getByTestId("search-pin");
  const b = (await pin.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2 - 80, { steps: 8 });
  await page.mouse.up();
  await expect(page).not.toHaveURL(/at=47\.37350%2C8\.52870/);
  await expect(page).toHaveURL(/at=47\.\d{5}%2C8\.\d{5}/);
});

test("pick a postcode without sharing a location; 'only this postcode' is one tap", async ({ page }) => {
  await page.goto("/");
  await mapCentre(page);
  await page.getByTestId("start-card").getByRole("combobox", { name: "Postleitzahl wählen" }).selectOption("8004");
  const panel = page.getByRole("dialog", { name: "PLZ 8004" });
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/plz=8004/);
  await page.getByRole("tab", { name: /Orte/ }).click();
  await expect(page.getByTestId("place-groups").getByRole("region").first()).toHaveAttribute("aria-label", "In PLZ 8004");

  await page.getByRole("radio", { name: "Nur PLZ 8004" }).click();
  await expect(page).toHaveURL(/scope=area/);
  const labels = await page
    .getByTestId("place-groups")
    .getByRole("region")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(labels).toEqual(["In PLZ 8004"]);
});

test("Kreis deep link shows the Kreis first, then neighbours by distance", async ({ page }) => {
  await page.goto("/?kreis=4&r=2000");
  await mapCentre(page);
  await expect(page.getByRole("dialog", { name: "Kreis 4" })).toBeVisible();
  await page.getByRole("tab", { name: /Orte/ }).click();
  const labels = await page
    .getByTestId("place-groups")
    .getByRole("region")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(labels[0]).toBe("In Kreis 4");
  expect(labels.slice(1).every((l) => l?.endsWith("ausserhalb"))).toBe(true);
});

test("deep link opens a station; tapping its marker reopens it", async ({ page }) => {
  await page.goto("/?station=mrh-stauffacher");
  const { canvas, box } = await mapCentre(page);
  const centre = focusPoint(box.width, box.height); // the station is centred in the free area at zoom 15
  const sheet = page.getByTestId("station-sheet");
  await expect(sheet).toContainText("Stauffacher");
  await expect(sheet.getByRole("link", { name: /Wir bringen/ })).toBeVisible();

  await page.getByRole("button", { name: "Schliessen" }).click();
  await expect(sheet).toBeHidden();
  await page.waitForTimeout(300); // let the symbol layer settle
  await canvas.click({ position: centre });
  await expect(sheet).toContainText("Stauffacher");
  await expect(page).toHaveURL(/station=mrh-stauffacher/);

  // With MRH stops hidden, the same tap picks that point instead.
  await page.getByRole("button", { name: "Schliessen" }).click();
  await page.getByRole("button", { name: "Mobiler Recyclinghof", exact: true }).click();
  await page.waitForTimeout(300);
  await canvas.click({ position: centre });
  await expect(page.getByRole("dialog", { name: "Gewählter Punkt" })).toContainText("Kreis 4");
});

test("geolocation denied keeps the map working and shows a hint", async ({ page }) => {
  // Simulate the user tapping "Block" on the permission prompt.
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_ok, err) =>
      err?.({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: "denied" } as GeolocationPositionError);
  });
  await page.goto("/");
  await mapCentre(page);
  await page.getByRole("button", { name: "Meinen Standort verwenden" }).click();
  await expect(page.getByRole("status")).toContainText(/Standort/);
  await expect(page.getByTestId("start-card")).toBeVisible();
});

test("geolocation: nearby list from my position, which is never written to the URL", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 47.3868, longitude: 8.5215 }); // Escher-Wyss-Platz
  await page.goto("/");
  await mapCentre(page);
  await page.getByRole("button", { name: "Meinen Standort verwenden" }).click();
  const panel = page.getByRole("dialog", { name: "Dein Standort" });
  await expect(panel).toContainText("Kreis 5 · 8005");
  await expect(page).not.toHaveURL(/at=/);
});
