import { expect, test } from "./fixtures";

test("/maptiler runs the full app on a MapTiler style, with the required logo", async ({ page }) => {
  const styleReq = page.waitForRequest(/api\.maptiler\.com\/maps\/streets-v2\/style\.json/);
  await page.goto("/maptiler?style=streets-v2&station=mrh-stauffacher");
  await styleReq;
  await expect(page.getByTestId("basemap-badge")).toHaveText("MapTiler Streets");
  await expect(page.getByTestId("maptiler-logo")).toBeVisible();
  await expect(page.getByTestId("station-sheet")).toContainText("Stauffacher");
  // URL state keeps the route and the style param
  await page.getByRole("button", { name: "Schliessen" }).click();
  await expect(page).toHaveURL(/\/maptiler\?style=streets-v2$/);
});

test("/maptiler falls back to Dataviz for an unknown style id", async ({ page }) => {
  const styleReq = page.waitForRequest(/api\.maptiler\.com\/maps\/dataviz\/style\.json/);
  await page.goto("/maptiler?style=../../evil");
  await styleReq;
  await expect(page.getByTestId("basemap-badge")).toHaveText("MapTiler Dataviz");
});

test("/compare shows swisstopo and MapTiler side by side with synced cameras", async ({ page }) => {
  await page.goto("/compare");
  const left = page.getByTestId("pane-left");
  const right = page.getByTestId("pane-right");
  await expect(left.locator(".maplibregl-canvas")).toBeVisible();
  await expect(right.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Kartenstil links" })).toHaveValue("swisstopo-light");
  await expect(page.getByRole("combobox", { name: "Kartenstil rechts" })).toHaveValue("maptiler-dataviz");
  await expect(right.getByTestId("maptiler-logo")).toBeVisible();
  await expect(left.getByTestId("maptiler-logo")).toHaveCount(0);
  await expect(page).toHaveURL(/left=swisstopo-light&right=maptiler-dataviz/);

  // Zoom in on the LEFT map: both readouts follow.
  const zl = page.getByTestId("zoom-left");
  const zr = page.getByTestId("zoom-right");
  await expect(zl).toHaveText("z12.0");
  await left.locator(".maplibregl-canvas").dblclick();
  await expect(zl).not.toHaveText("z12.0");
  const leftZoom = await zl.textContent();
  await expect(zr).toHaveText(leftZoom!);

  // And the other way round, via the right map's zoom-out button.
  await right.getByRole("button", { name: "Zoom out" }).click();
  await expect(zr).not.toHaveText(leftZoom!);
  await expect(zl).toHaveText((await zr.textContent())!);

  // The camera lives in the hash, so the comparison can be shared.
  await expect(page).toHaveURL(/#\d/);
});

test("/compare style pickers update the URL and the requested style", async ({ page }) => {
  await page.goto("/compare?left=swisstopo-base&right=maptiler-dataviz");
  await expect(page.getByRole("combobox", { name: "Kartenstil links" })).toHaveValue("swisstopo-base");
  const styleReq = page.waitForRequest(/api\.maptiler\.com\/maps\/pastel\/style\.json/);
  await page.getByRole("combobox", { name: "Kartenstil rechts" }).selectOption("maptiler-pastel");
  await styleReq;
  await expect(page).toHaveURL(/right=maptiler-pastel/);
});

test("/compare: selecting a station highlights it on both maps", async ({ page }) => {
  await page.goto("/compare#15/47.3735/8.5287"); // centred on Stauffacher
  const left = page.getByTestId("pane-left").locator(".maplibregl-canvas");
  await expect(left).toBeVisible();
  const box = (await left.boundingBox())!;
  await page.waitForTimeout(400);
  await left.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.getByTestId("compare-selection")).toContainText("Stauffacher");
});
