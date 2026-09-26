# Furtli — recycling map for Zürich

Where and when you can drop off recyclables in Zürich: Mobile Recyclinghöfe, the Sonderabfallmobil and Sammelstellen on one map, with a "Wir bringen's hin" pickup option.

Built on the startup-template scaffold (Next.js 16, TypeScript, Tailwind v4, Drizzle + Neon, Vercel). The template's sample quiz app and Clerk auth have been removed; their files are parked in `_to_delete/` (git-ignored) for you to review and delete.

## Status

| Step | Scope | State |
| --- | --- | --- |
| 1. Map view | Kreis polygons, filters, detail sheet, locate, URL state | **Done** — local |
| 2. Ingestion + nearby search | Open Data Zürich → Postgres → `/api/stations`; search from a tapped point, your location, a postcode or a Kreis; results grouped by distance | **Done** — local, first live run on your Mac |
| 3. Production | Vercel + Neon, domain, real-phone checks; scheduled ingest after the fetch/load split | Next |

## Quickstart

Without a database the map shows 10 sample stations ("Beispieldaten"):

```bash
pnpm install
pnpm dev                              # http://localhost:3000
```

With real data (local Docker Postgres, or a Neon dev branch):

```bash
docker compose up -d                  # or use a Neon branch's connection strings
cp .env.example apps/web/.env.local   # DATABASE_URL
cp .env.example packages/db/.env      # DATABASE_URL (+ DATABASE_URL_UNPOOLED for Neon)
pnpm db:migrate                       # creates the tables
pnpm ingest:dry                       # fetch + validate + show what would change
pnpm ingest                           # load it
pnpm dev
```

Try: tap anywhere on the map; `/?plz=8004`; `/?kreis=4&scope=area`; `/?at=47.37350,8.52870&r=2000`.

## Finding what's nearby

The search starts from a **place**, not from the user's identity:

| Input | How | In the URL |
| --- | --- | --- |
| A point | Tap the map (e.g. your home while you're at work), drag the pin | `?at=lat,lng` |
| Your location | Locate button (never written to the URL) | – |
| A postcode | PLZ picker | `?plz=8004` |
| A Kreis | Kreis picker | `?kreis=4` |

- **"In der Nähe" is the default:** everything within the radius (500 m / 1 km / 2 km, `&r=`) of the point, or of the Kreis/postcode *outline*, so people living near a border see the stop 300 m away in the next Kreis. **"Nur Kreis 4" / "Nur PLZ 8004"** (`&scope=area`) restricts to the area.
- **Results are grouped by distance**: "bis 300 m", "300–600 m", "600 m – 1 km", … (for areas: "In Kreis 4", then "… ausserhalb"). Two tabs: **Termine** (upcoming Mobile Recyclinghof / Sonderabfallmobil dates, soonest first in each band) and **Orte** (all stations incl. Sammelstellen and Recyclinghöfe, nearest first).
- A stop the city assigns to the searched postcode gets an **"offiziell für 8004"** badge. The postcode's next kerbside dates (paper, cardboard, organic, waste) are shown on top.
- The maths is in `packages/geo` (pure functions, unit-tested) and runs in the browser, so moving the pin updates the list instantly. Stations outside the results are dimmed on the map.

## Data pipeline (`packages/ingest`)

```
Open Data Zürich ── CKAN DataStore (6 yearly calendars) ─┐
                 └─ WFS GeoJSON (4 station layers) ───────┤
                                                          ▼
   fetch → store raw (source_file, deduped by SHA-256) → validate (zod; a changed
   header or bad date stops the run) → stations from the geo layers (+ Kreis) →
   match calendar stop names to stations (exact → normalised → PLZ+place →
   alias) → diff against the database → one transaction → ingest_run log
```

- **Tables** (`packages/db/src/schema.ts`): `station`, `collection_event`, `source_file` (every raw payload ever loaded), `ingest_run`.
- **Safe to re-run**: a second run changes nothing; city corrections replace moved dates; a failed run writes nothing. A stop name that can't be matched to a location stops the run and names it; after checking it on the map, add a line to `STATION_ALIASES` in `packages/ingest/src/match.ts`.
- **When**: `pnpm ingest` by hand for now. The scheduled run (Vercel Cron) is switched off until the fetch/load split; `/api/ingest` still exists and can be called manually with `Authorization: Bearer $CRON_SECRET`. Next year's calendars load automatically once the city publishes them (usually Q4).
- `/api/stations` and `/api/calendar?plz=` read the database and are cached for an hour at Vercel's CDN.

### Comparing base maps (swisstopo vs MapTiler)

Add a MapTiler key to `apps/web/.env.local` (`NEXT_PUBLIC_MAPTILER_KEY=…`, free at cloud.maptiler.com; allow `localhost` and your Vercel domains under *Allowed HTTP origins*), restart `pnpm dev`, then:

| Route | What it shows |
| --- | --- |
| `/` | The app on swisstopo Light (production default) |
| `/maptiler` | The same app on MapTiler; `?style=dataviz` (default), `streets-v2`, `basic-v2`, `bright-v2`, `pastel`, `backdrop`, `topo-v2`, or any MapTiler map id. Deep links work too: `/maptiler?style=pastel&kreis=4` |
| `/compare` | Two maps side by side (stacked on phones), cameras in sync, a style picker per pane. `?left=swisstopo-light&right=maptiler-dataviz`; the camera is in the hash, so a link reproduces the exact view |

Without a key, `/maptiler` explains how to add one and `/compare` compares the two swisstopo styles. Both routes are `noindex`; the MapTiler logo is shown as the free plan requires. In `pnpm dev`, the style dropdown on `/` also lists the MapTiler styles and links to `/compare`.
To test on your phone on the same Wi-Fi, add your Mac's LAN IP to `allowedDevOrigins` in `apps/web/next.config.ts` and open `http://<ip>:3000`. Geolocation needs HTTPS on phones — use a Vercel preview (or `next dev --experimental-https`) to test "Use my location".

## How the map is built

```
apps/web/
  app/page.tsx                 server page: reads ?at= / ?plz= / ?kreis= / ?station=, renders MapShell
  app/api/stations|calendar|ingest   data API + the (manual) ingest endpoint
  app/abholen/page.tsx         placeholder for the pickup booking flow (CTA target)
  app/maptiler/page.tsx        same app on a MapTiler style (?style=)
  app/compare/page.tsx         side-by-side base-map comparison
  components/compare/          CompareView (synced panes), MissingKeyNotice
  components/map/
    MapShell.tsx               client: search state, URL, camera, panels
    ZurichMap.tsx              MapLibre map (ssr:false): layers, tap-to-pick, draggable pin, radius
    NearbyPanel.tsx            results grouped by distance (Termine / Orte), scope + radius
    StationSheet.tsx, Sheet.tsx   details; bottom sheet < 768 px, side panel above
    PlacePicker.tsx, LocateButton.tsx, TypeFilterChips.tsx, KindDot.tsx, layers.ts, icons.ts
  lib/geo/
    types.ts                   StationFeature contract — ingestion must produce this shape
    stations.ts                getStations(): the ONE place that knows where data lives
    anchor.ts, group.ts        URL ↔ search state; grouping into distance bands
    kinds.ts                   labels, colours, pictograms, MRH hours per station type
    data/stations.seed.json    10 placeholder stations (served when there's no database)
  lib/server/stations.ts       database queries behind the API
packages/
  geo/       Kreis + postcode outlines (data/), point-in-area, distances, nearby()
  ingest/    the pipeline, `pnpm ingest`, recorded fixtures for tests
  db/        Drizzle schema, migrations, lazy connection (getDb)
```

- **Base map:** swisstopo Light Base Map by default; set `NEXT_PUBLIC_MAP_STYLE_URL` to switch (e.g. MapTiler). In `pnpm dev` a small dropdown in the top bar switches styles live for comparison.
- **Labels** use whatever font the base style ships, detected at runtime, so switching provider never breaks glyphs.
- **Type filter** filters the source data, not the layer, so cluster counts stay correct.
- **Outlines:** 12 Kreise (Open Data Zürich) and the 24 city postcodes (swisstopo's official postcode directory, Zürich part only), both CC0/open, simplified to ~4 m, loaded as a separate chunk.
- **maplibre-gl is pinned to v5.** v6 loads its web worker as a separate file that Next's bundler doesn't ship ("Worker failed to load"); upgrading needs `setWorkerUrl` plus copying the worker into `public/`.
- **Fonts** (Bricolage Grotesque, Atkinson Hyperlegible) are self-hosted via `@fontsource` packages: no Google Fonts request at build time.

## Tests

```bash
pnpm test              # 50 unit + component tests (geo maths, parsers, station matching, UI)
pnpm test:integration  # 8 pipeline tests against real Postgres (needs `pnpm --filter db db:test:setup` once)
pnpm test:e2e          # Playwright, mobile + desktop; map styles stubbed, no secrets
```

See [`docs/TESTING.md`](docs/TESTING.md). CI (`.github/workflows/ci.yml`) runs lint, tests, typecheck, build and E2E on every PR and push to `main`.

## Database

One migration, `0000_recycling_schema`. `pnpm db:migrate` applies it; in production the `DB migrate (Neon)` workflow does it on merge. See [`docs/DATABASE.md`](docs/DATABASE.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (the ARCHITECTURE doc still describes Clerk; auth comes back only when pickups need accounts).

## Regenerating the Kreis boundaries

`bash scripts/prepare-kreise.sh` (needs internet; uses mapshaper via npx).
