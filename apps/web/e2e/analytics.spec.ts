import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Umami isn't loaded in tests (no website id), so we stand in for its tracker
// and record what the app would send.
type Sent = [string, Record<string, unknown> | undefined];

async function recordEvents(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __events: unknown[]; umami: unknown };
    w.__events = [];
    // track(fn) is a pageview (see trackPageview): record what it would send.
    w.umami = {
      track: (e: unknown, d?: unknown) =>
        w.__events.push(
          typeof e === "function"
            ? ["$pageview", e({ url: location.pathname + location.search, referrer: document.referrer })]
            : [e, d],
        ),
    };
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
  const row = page.getByTestId("place-groups").getByRole("button").first();
  await row.click(); // marks it on the map
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await row.click(); // opens it
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
  expect(named(sent, "station_preview")).toHaveLength(1);
  const opened = named(sent, "station_open");
  expect(opened).toHaveLength(1);
  // Second tap on the list row: which station, its Kreis, and how it was opened.
  expect(opened[0][1]).toMatchObject({ via: "list" });
  expect(typeof opened[0][1]?.station).toBe("string");
  expect(typeof opened[0][1]?.kreis).toBe("number");
});

test("one pageview per path: map searches and panel changes don't add views", async ({ page }) => {
  await recordEvents(page);
  await page.goto("/");
  await tapEmptySpot(page);
  await expect(page.getByRole("dialog", { name: "Gewählter Punkt" })).toBeVisible();
  await page.getByRole("combobox", { name: "Umkreis" }).selectOption("2000");
  await expect(page).toHaveURL(/r=2000/); // the query string changed…

  const views = named(await events(page), "$pageview");
  expect(views).toHaveLength(1); // …but it's still one view
  expect(views[0][1]).toMatchObject({ url: expect.stringMatching(/^\/(\?|$)/) });
});

test("place_search carries how much the search found", async ({ page }) => {
  await recordEvents(page);
  await page.goto("/");
  await tapEmptySpot(page);
  await expect(page.getByRole("dialog", { name: "Gewählter Punkt" })).toBeVisible();

  await expect.poll(async () => named(await events(page), "place_search").length).toBe(1);
  const [search] = named(await events(page), "place_search");
  expect(search[1]).toMatchObject({ by: "map", radius: 1000 });
  expect(typeof search[1]?.result_count).toBe("number");
  expect(search[1]?.results).toMatch(/^(0|1-2|3-5|6-10|11\+)$/);
});

test("a deep link to a station counts as station_open via link, without a first_action", async ({ page }) => {
  await recordEvents(page);
  await page.goto("/?station=mrh-stauffacher");
  await expect(page.getByTestId("station-sheet")).toBeVisible();
  await expect.poll(async () => named(await events(page), "station_open").length).toBe(1);
  const sent = await events(page);
  expect(named(sent, "station_open")[0][1]).toMatchObject({ station: "mrh-stauffacher", via: "link", kind: "mrh" });
  expect(named(sent, "first_action")).toHaveLength(0);
  expect(named(sent, "place_search")).toHaveLength(0);
});

test("map_ready fires once with the load time", async ({ page }) => {
  await recordEvents(page);
  await page.goto("/");
  await expect(page.getByTestId("start-card")).toBeVisible();
  await expect.poll(async () => named(await events(page), "map_ready").length).toBe(1);
  const [ready] = named(await events(page), "map_ready");
  expect(typeof ready[1]?.ms).toBe("number");
  expect(ready[1]?.within).toMatch(/^(<1s|1-2s|2-4s|4-8s|8s\+)$/);
});

test("a failing stations API is counted as client_error with its status", async ({ page }) => {
  await recordEvents(page);
  await page.route("**/api/stations", (route) => route.fulfill({ status: 503, json: { error: "down" } }));
  await page.goto("/");
  // Not getByRole("alert"): Next.js's route announcer is an (empty) alert too.
  await expect(page.getByText("Stationen konnten nicht geladen werden.")).toBeVisible();
  await expect
    .poll(async () => named(await events(page), "client_error").map(([, d]) => d))
    .toContainEqual({ where: "stations_api", code: "503" });
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

test("visit_source records where a visit came from, once per session", async ({ page }) => {
  await recordEvents(page);
  await page.goto("/?utm_source=reddit&utm_medium=community&utm_campaign=w2-launch&utm_content=p08-reddit-launch");
  await expect(page.getByTestId("start-card")).toBeVisible();
  await expect.poll(async () => named(await events(page), "visit_source").length).toBe(1);

  // A reload is the same browser session (sessionStorage survives): no second
  // visit_source. The recorder starts empty again on every page load.
  await page.reload();
  await expect(page.getByTestId("start-card")).toBeVisible();
  expect(named(await events(page), "visit_source")).toHaveLength(0);
});

test("visit_source and first_action carry the channel and post", async ({ page }) => {
  await recordEvents(page);
  await page.goto("/?utm_source=reddit&utm_medium=community&utm_campaign=w2-launch&utm_content=p08-reddit-launch");
  await tapEmptySpot(page);
  await expect(page.getByRole("dialog", { name: "Gewählter Punkt" })).toBeVisible();

  const sent = await events(page);
  const visit = named(sent, "visit_source");
  expect(visit).toHaveLength(1);
  expect(visit[0][1]).toMatchObject({ channel: "community", origin: "reddit", post: "p08-reddit-launch", campaign: "w2-launch", landing: "/" });
  expect(named(sent, "first_action")[0][1]).toMatchObject({ channel: "community", origin: "reddit", post: "p08-reddit-launch" });
});
