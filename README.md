# Furtli — recycling map for Zürich

Where and when you can drop off recyclables in Zürich: Mobile Recyclinghöfe, the Sonderabfallmobil and Sammelstellen on one map, with a "Wir bringen's hin" pickup option.

Built on the startup-template scaffold (Next.js 16, TypeScript, Tailwind v4, Drizzle + Neon, Vercel). The template's sample quiz app and Clerk auth have been removed; their files are parked in `_to_delete/` (git-ignored) for you to review and delete.

## Status

| Step | Scope | State |
| --- | --- | --- |
| 1. Map view | Kreis polygons, filters, detail sheet, locate, URL state | **Done** — local |
| 2. Ingestion + nearby search | Open Data Zürich → Postgres → `/api/stations`; search from a tapped point, your location, a postcode or a Kreis; results grouped by distance | **Done** — local, first live run on your Mac |
| 3. Production | Vercel + Neon, domain, real-phone checks; scheduled ingest after the fetch/load split | Pipeline ready: two Vercel projects — `master` → staging (furtli-web.vercel.app), `release` → furtli.ch — both behind the app's password gate, going live only after CI + migration pass. One-time setup in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |

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

### Base map

The map uses swisstopo's free vector base maps (Light by default; keyless, commercial use allowed, Switzerland only). In `pnpm dev`, a small dropdown in the top bar switches between swisstopo Light and Base.

To test on your phone on the same Wi-Fi, add your Mac's LAN IP to `allowedDevOrigins` in `apps/web/next.config.ts` and open `http://<ip>:3000`. Geolocation needs HTTPS on phones — use a Vercel preview (or `next dev --experimental-https`) to test "Use my location".

## Analytics (Umami) and email reminders (Resend)

### Where visitors come from

- **Umami** (cookieless, no consent banner) loads only when `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is set. Before anything is sent, a small filter (`lib/analytics/umami.ts`) removes every query parameter except the UTM tags and area filters (`plz`, `kreis`, `station`, `scope`, `r`), so a tapped home location (`?at=`) never reaches Umami.
- **UTM links** for every post, QR card and email: `?utm_source=instagram&utm_medium=social&utm_campaign=reel-wasserkocher` (scheme in the 09a posting plan). Umami's *UTM* and *Referrers* reports show visits per source.
- **Sign-ups are attributed too:** the first page of a visit stores its UTM tags and referring site in `sessionStorage`; the subscribe form sends them along and they're saved on the `subscriber` row (`utm_*`, `referrer`, `landing_path`, `signup_source`). Subscribers per channel:

  ```sql
  select coalesce(utm_source, referrer, 'direct') as source, utm_campaign,
         count(*) filter (where status = 'active') as active, count(*) as signed_up
  from subscriber group by 1, 2 order by active desc;
  ```

- **Custom events** (Umami → Events): `place_search` (by plz/kreis/map/gps), `station_open` (kind), `pickup_cta` (station), `subscribe_open`, `subscribe_submit` (source, topics, utm_source), `subscribe_confirmed`, `unsubscribe`. A funnel `subscribe_open → subscribe_submit → subscribe_confirmed` in Umami shows the drop-off.

### Reminder emails

```
map (PLZ panel / MRH stop) ── "Erinnerung per E-Mail" form ── POST /api/subscribe
   → subscriber (pending) + confirmation email ── /abo/bestaetigen (button) → active + welcome email
   → Vercel Cron 16:00 UTC daily ── /api/cron/emails ── reminders for tomorrow; Sundays also the weekly overview
   → every email: footer link /abo/abmelden + one-click List-Unsubscribe header
```

- **Double opt-in:** nothing but the confirmation email is sent before the button on `/abo/bestaetigen` is pressed. Changes by an active subscriber are held in `pending_prefs` until confirmed. The API answers the same for known and unknown addresses.
- **Exactly once:** each reminder/digest is claimed in `email_log` (unique subscriber + kind + date) before sending, so re-runs never send twice. Failed sends stay `failed` (see the run summary).
- **Templates** (React Email, DE + EN): `apps/web/emails/` (confirm, welcome, reminder, weekly overview); all wording in `lib/email/copy.ts`. Preview while editing: `pnpm --filter web email:dev` → http://localhost:3001.
- **Locally without Resend:** leave `RESEND_API_KEY` unset; emails are printed to the `pnpm dev` log with their links (click the confirm link from there). Run the cron by hand: `curl -H "Authorization: Bearer $CRON_SECRET" "localhost:3000/api/cron/emails?dryRun=1"` (`&forceDigest=1` for the Sunday overview).
- **Going live:** verify the sending domain in Resend (SPF, DKIM, DMARC), set `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET` in Vercel, run `pnpm db:migrate` (migration `0001_email_subscriptions`). Review `/datenschutz` (draft) and the collection hints in `lib/email/copy.ts` before launch.

## How the map is built

```
apps/web/
  app/page.tsx                 server page: reads ?at= / ?plz= / ?kreis= / ?station=, renders MapShell
  app/api/stations|calendar|ingest   data API + the (manual) ingest endpoint
  app/abholen/page.tsx         placeholder for the pickup booking flow (CTA target)
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

- **Base map:** swisstopo Light Base Map (free, keyless). `NEXT_PUBLIC_MAP_STYLE_URL` overrides the style URL; in `pnpm dev` a small dropdown in the top bar switches between swisstopo Light and Base.
- **Labels** use whatever font the base style ships, detected at runtime, so changing the style never breaks glyphs.
- **Type filter** filters the source data, not the layer, so cluster counts stay correct.
- **Outlines:** 12 Kreise (Open Data Zürich) and the 24 city postcodes (swisstopo's official postcode directory, Zürich part only), both CC0/open, simplified to ~4 m, loaded as a separate chunk.
- **maplibre-gl is pinned to v5.** v6 loads its web worker as a separate file that Next's bundler doesn't ship ("Worker failed to load"); upgrading needs `setWorkerUrl` plus copying the worker into `public/`.
- **Fonts** (Bricolage Grotesque, Atkinson Hyperlegible) are self-hosted via `@fontsource` packages: no Google Fonts request at build time.

## Tests

```bash
pnpm test              # 81 unit + component tests (geo maths, parsers, station matching, UI, email templates,
                       # and the whole subscription flow against in-process Postgres via PGlite)
pnpm test:integration  # 8 pipeline tests against real Postgres (needs `pnpm --filter db db:test:setup` once)
pnpm test:e2e          # Playwright, mobile + desktop; map styles stubbed, no secrets
```

See [`docs/TESTING.md`](docs/TESTING.md). CI (`.github/workflows/ci.yml`) runs lint, tests, typecheck, build and E2E on every PR and push to `main`.

## Database

Two migrations: `0000_recycling_schema` and `0001_email_subscriptions` (`subscriber`, `email_log`). `pnpm db:migrate` applies them; in production the `DB migrate (Neon)` workflow does it on merge. See [`docs/DATABASE.md`](docs/DATABASE.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (the ARCHITECTURE doc still describes Clerk; auth comes back only when pickups need accounts).

## Regenerating the Kreis boundaries

`bash scripts/prepare-kreise.sh` (needs internet; uses mapshaper via npx).
