import { test as base, expect } from "@playwright/test";

/** Minimal MapLibre style: a plain background, no tiles, no glyphs. */
const stubStyle = (color: string) => ({
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": color } }],
});
const STUB_STYLE = stubStyle("#EEF0EC");


export const test = base.extend({
  page: async ({ page }, provide) => {
    await page.route("https://vectortiles.geo.admin.ch/**", (route) =>
      route.request().url().endsWith("style.json")
        ? route.fulfill({ json: STUB_STYLE })
        : route.fulfill({ status: 404, body: "" }),
    );
    await page.route("https://api.maptiler.com/**", (route) => {
      const url = route.request().url();
      if (url.includes("style.json")) {
        return route.fulfill({ json: stubStyle("#E4ECF4") });
      }
      if (url.endsWith("logo.svg")) {
        return route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="67" height="20"><rect width="67" height="20" fill="#333"/></svg>',
        });
      }
      return route.fulfill({ status: 404, body: "" });
    });
    await provide(page);
  },
});

export { expect };
