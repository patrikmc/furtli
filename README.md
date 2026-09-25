# Furtli — recycling map for Zürich

Where and when you can drop off recyclables in Zürich: Mobile Recyclinghöfe, the Sonderabfallmobil and Sammelstellen on one map, with a "Wir bringen's hin" pickup option.

Built on the startup-template scaffold (Next.js 16, TypeScript, Tailwind v4, Drizzle + Neon, Vercel). The template's sample quiz app and Clerk auth have been removed; their files are parked in `_to_delete/` (git-ignored) for you to review and delete.

## Status

| Step | Scope | State |
| --- | --- | --- |
| 1. Map view | Kreis polygons, seed stations, filters, detail sheet, locate, URL state | **Done** — local |
| 2. Ingestion | ERZ data → Neon → `/api/stations` (same shape as the seed file) | Next |
| 3. Production | Vercel + Neon, domain, real-phone checks | Later |

## Quickstart (map only — no database, no accounts needed)

```bash
pnpm install
cp .env.example apps/web/.env.local   # optional: defaults work without it
pnpm dev                              # http://localhost:3000
```

Try the deep links: `/?station=mrh-stauffacher`, `/?kreis=4`.
To test on your phone on the same Wi-Fi, add your Mac's LAN IP to `allowedDevOrigins` in `apps/web/next.config.ts` and open `http://<ip>:3000`. Geolocation needs HTTPS on phones — use a Vercel preview (or `next dev --experimental-https`) to test "Use my location".

## How the map is built

```
apps/web/
  app/page.tsx                 server page: reads ?kreis=&station=, renders MapShell
  app/abholen/page.tsx         placeholder for the pickup booking flow (CTA target)
  components/map/
    MapShell.tsx               client: data loading, selection + URL state, overlays
    ZurichMap.tsx              MapLibre map (loaded with ssr:false), sources, layers, clicks
    layers.ts                  layer styles (Kreis fill/line/label, clusters, markers)
    icons.ts                   marker icons drawn on canvas from lib/geo/kinds.ts
    StationSheet.tsx           bottom sheet < 768 px, side panel above
    TypeFilterChips.tsx, LocateButton.tsx, KindDot.tsx
  lib/geo/
    types.ts                   StationFeature contract — ingestion must produce this shape
    stations.ts                getStations(): the ONE place that knows where data lives
    kreis.ts                   point-in-Kreis, bounds, URL param parsing
    kinds.ts                   labels, brand colours, pictograms per station type
  lib/map-config.ts            base-map style (env), dev style switcher options, attribution
  public/geo/
    stadtkreise.geojson        12 Kreise, WGS84, 37 KB (Open Data Zürich, CC0)
    stations.seed.geojson      10 placeholder stations (placeholder: true)
```

- **Base map:** swisstopo Light Base Map by default; set `NEXT_PUBLIC_MAP_STYLE_URL` to switch (e.g. MapTiler). In `pnpm dev` a small dropdown in the top bar switches styles live for comparison.
- **Labels** use whatever font the base style ships, detected at runtime, so switching provider never breaks glyphs.
- **Type filter** filters the source data, not the layer, so cluster counts stay correct.
- **Seed → real data:** step 2 replaces `STATIONS_URL` in `lib/geo/stations.ts` with `/api/stations`. `parseStations()` validates either source.
- **maplibre-gl is pinned to v5.** v6 loads its web worker as a separate file that Next's bundler doesn't ship ("Worker failed to load"); upgrading needs `setWorkerUrl` plus copying the worker into `public/`.
- **Fonts** (Bricolage Grotesque, Atkinson Hyperlegible) are self-hosted via `@fontsource` packages: no Google Fonts request at build time.

## Tests

```bash
pnpm test        # 17 unit + component tests (geo helpers, seed data quality, sheet, chips)
pnpm test:e2e    # Playwright, mobile + desktop; base-map style stubbed, no secrets
```

See [`docs/TESTING.md`](docs/TESTING.md). CI (`.github/workflows/ci.yml`) runs lint, tests, typecheck, build and E2E on every PR and push to `main`.

## Database (step 2)

`packages/db` keeps the Drizzle + Postgres client, but the schema is empty and the quiz migration was retired. The web app does not depend on it yet. When ingestion starts: add `stations` / `collection_dates` to `packages/db/src/schema.ts`, run `pnpm db:generate`, and drop the old quiz tables from the Neon branch that already has them. See [`docs/DATABASE.md`](docs/DATABASE.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (the ARCHITECTURE doc still describes Clerk; auth comes back only when pickups need accounts).

## Regenerating the Kreis boundaries

`bash scripts/prepare-kreise.sh` (needs internet; uses mapshaper via npx).
