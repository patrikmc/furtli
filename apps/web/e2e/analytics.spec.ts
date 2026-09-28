import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Umami isn't loaded in tests (no website id), so we stand in for its tracker
// and record what the app would send.
type Sent = [string, Record<string, unknown> | undefined];

async function recordEvents(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __events: unknown[]; umami: unknown };
    w.__events = [];
    w.umami = { track: (e: string, d?: unknown) => w.__events.push([e, d]) };
  });
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { __events: Sent[] }).__events);
const named = (list: Sent[], name: string) => list.filter(([e]) => e === name);

async function tapEmptySpot(page: Page) {
  const canvas = page.locator(".maplibregl-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByText("Karte lädt")).toBeHidden();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2 + 60, y: box.height / 2 - 60 } });
}

test("first_action fires once per page load; panel changes are tracked", async ({ page }) => {
  await recordEvents(page);
  await page.goto("/");
  await tapEmptySpot(page);
  await expect(page.getByRole("dialog", { name: "Gewählter Punkt" })).toBeVisible();

  await page.getByRole("combobox", { name: "Umkreis" }).selectOption("2000");
  await page.getByRole("tab", { name: /Orte/ }).click();
  await page.getByTestId("place-groups").getByRole("button").first().click();
  await expect(page.getByTestId("station-sheet")).toBeVisible();

  const sent = await events(page);
  const first = named(sent, "first_action");
  expect(first).toHaveLength(1);
  expect(first[0][1]).toMatchObject({ action: "search_map", lang: "de" });
  expect(typeof first[0][1]?.seconds).toBe("number");
  expect(named(sent, "panel_change").map(([, d]) => d)).toEqual([
    { control: "radius", value: 2000 },
    { control: "tab", value: "places" },
  ]);
  expect(named(sent, "station_open")).toHaveLength(1);
});

test("search_no_result fires once when a search shows no station", async ({ page }) => {
  await recordEvents(page);
  await page.goto("/");
  await expect(page.getByTestId("start-card")).toBeVisible();
  // Switch every type off, so any search is empty.
  for (const name of ["Mobiler Recyclinghof", "Sonderabfall", "Sammelstelle", "Recyclinghof"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await tapEmptySpot(page);
  await expect(page.getByRole("dialog", { name: "Gewählter Punkt" })).toBeVisible();

  const sent = await events(page);
  expect(named(sent, "first_action").map(([, d]) => d?.action)).toEqual(["filter"]);
  const none = named(sent, "search_no_result");
  expect(none).toHaveLength(1);
  expect(none[0][1]).toMatchObject({ by: "map", reason: "filtered", mode: "nearby" });
});
