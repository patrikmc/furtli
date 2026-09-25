import { test as base, expect } from "@playwright/test";

/** Minimal MapLibre style: a plain background, no tiles, no glyphs. */
const STUB_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#EEF0EC" } }],
};

export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.route("https://vectortiles.geo.admin.ch/**", (route) =>
      route.request().url().endsWith("style.json")
        ? route.fulfill({ json: STUB_STYLE })
        : route.fulfill({ status: 404, body: "" }),
    );
    await provide(page);
  },
});

export { expect };
