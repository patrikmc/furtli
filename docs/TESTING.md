# Testing

| Layer | Tool | What it covers | Where | CI |
| --- | --- | --- | --- | --- |
| Unit | Vitest | Geo helpers: seed validation, point-in-Kreis, URL params | `apps/web/lib/**/*.test.ts` | Yes |
| Component | Vitest + Testing Library | Detail sheet, filter chips | `apps/web/components/**/*.test.tsx` | Yes |
| Integration | Vitest + real Postgres | DB queries (from step 2, ingestion) | `packages/db/src/*.integration.test.ts` | Yes (none yet) |
| E2E | Playwright | Real browser, production build, mobile + desktop viewports | `apps/web/e2e/*.spec.ts` | Yes |

```bash
pnpm test              # unit + component, every package — no DB, no network
pnpm test:e2e          # builds + starts the app, runs Playwright (mobile + desktop)
pnpm --filter web test:watch
```

First E2E run on a new machine: `pnpm --filter web exec playwright install chromium`.

**Why E2E doesn't need swisstopo:** `e2e/fixtures.ts` intercepts the base-map
style request and serves a blank style, so the tests check *our* layers, UI
and URL state, and never fail because a third-party tile server is slow.
Check the real base map by eye with `pnpm dev`.

**Clicking markers in E2E:** the map is a WebGL canvas, so tests open a deep
link (`/?station=mrh-stauffacher`), which centres that station at zoom 15, and
click the canvas centre.

The seed test (`lib/geo/geo.test.ts`) also guards data quality: every
station's `kreis` must match the Kreis polygon it sits in, and the Kreis
file must stay under 60 KB. The ingestion pipeline should keep both checks.
