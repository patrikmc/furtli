# Deployment: staging and production

Two Vercel projects, one repo. Vercel deploys on push; GitHub Actions tests and migrates; Vercel **Deployment Checks** keep a new build offline until GitHub is green.

| | Staging | Production |
| --- | --- | --- |
| Vercel project | `furtli-web` (existing) | new project, e.g. `furtli` |
| Production branch | `master` | `release` |
| Address | https://furtli-web.vercel.app | https://furtli.ch (+ www) |
| Database | Neon staging project, branch `staging` | Neon project `furtli-production` |
| GitHub environment | `staging` | `production` |
| Access | app password gate (`SITE_PASSWORD`) | app password gate (own `SITE_PASSWORD`) |
| Reminder emails | Vercel Cron 16:00 UTC, subjects start `[Staging]` | Vercel Cron 16:00 UTC |
| PR previews | yes (with Neon preview branches) | no |
| Search engines | noindex | indexable (`APP_ENV=production`) |

## How a change travels

```
feature branch ──PR──▶ CI (ci, e2e) + preview in the staging project
      │ merge
      ▼
   master ──push──▶ Vercel (staging project) builds   ┐ both green →
                    GitHub CI: ci ▶ e2e ▶ migrate (staging)    ┘ furtli-web.vercel.app switches over
      │ pnpm release   (fast-forwards release to master)
      ▼
   release ─push──▶ Vercel (production project) builds ┐ both green →
                    GitHub CI: ci ▶ e2e ▶ migrate (production) ┘ furtli.ch switches over
```

- `.github/workflows/ci.yml` — jobs `ci` (lint, unit + integration tests, typecheck, build), `e2e` (Playwright) and, on pushes to master/release only, `migrate (staging)` / `migrate (production)` (database of that environment). Required Deployment Checks: staging project `ci`, `e2e`, `migrate (staging)`; production project `ci`, `e2e`, `migrate (production)`. The migrate names differ on purpose: a release commit already has green checks from its master run, including the staging migration. Renaming a job → update the checks in Vercel.
- `.github/workflows/db-migrate.yml` — run migrations by hand (Actions → DB migrate → pick environment).
- `pnpm release [sha]` (`scripts/promote-release.sh`) — shows what's new, checks CI passed on master for that commit, fast-forwards `release`. By hand instead: `git fetch origin && git push origin origin/master:release` (refused unless it's a fast-forward).
- `scripts/vercel-ignore-build.sh` — the "Ignored Build Step" of both projects: production builds only `release`; staging builds everything except `release`.
- `pnpm db:reset` (`packages/db/src/scripts/reset.ts`) — empties a database after typing its host. For staging only (clear testers' sign-ups).
- App password gate: `apps/web/proxy.ts` + `lib/access.ts`. With `SITE_PASSWORD` set, pages redirect to `/zugang`, APIs answer 401; 90-day cookie. Open without password: `/zugang`, `/api/cron/*`, `/api/ingest` (CRON_SECRET), `/api/email/*`, `/abo/*` (tokens), static files. Unset = public.

**Database changes:** `migrate` runs just before the new build goes live, so for a moment the old code runs on the new schema. Keep migrations backward compatible (add columns first, remove them a release later).
**Hotfix:** branch → PR → merge to master → staging green → `pnpm release`.
**Rollback:** production project → Deployments → previous deployment → Instant Rollback. Migrations don't roll back.

## One-time setup

### 1. Staging project (`furtli-web`, existing)

1. Settings → Environments → delete the custom `staging` environment (move any variables you set there first, see 3).
2. Settings → Environments → Production → Branch Tracking: `master`.
3. Settings → Environment Variables (environment **Production**, plus **Preview** where marked):

   | Variable | Type | Value |
   | --- | --- | --- |
   | `APP_ENV` | Config | `staging` — Production **and** Preview |
   | `DATABASE_URL` | Secret | Neon staging project, branch `staging`, **pooled** |
   | `SITE_PASSWORD` | Secret | tester password — Production (Preview optional) |
   | `CRON_SECRET` | Secret | random, 32+ characters |
   | `RESEND_API_KEY` | Secret | staging Resend key |
   | `NEXT_PUBLIC_SITE_URL` | Config | `https://furtli-web.vercel.app` |
   | `EMAIL_FROM` / `EMAIL_REPLY_TO` / `EMAIL_CONTACT_ADDRESS` | Config | `Furtli <hallo@furtli.ch>` / `hallo@furtli.ch` / `hallo@furtli.ch` |
   | `EMAIL_SUBJECT_PREFIX` | Config | `[Staging] ` (trailing space) |

   Preview `DATABASE_URL` comes from the Neon integration (one Neon branch per PR). Delete leftover Preview variables tied to the `release` branch.
4. Settings → Build and Deployment → **Ignored Build Step** → Custom → `bash ../../scripts/vercel-ignore-build.sh`.
5. Settings → Build and Deployment → **Deployment Checks** → Add Checks → GitHub → `ci`, `e2e`, `migrate (staging)`.
6. Settings → Deployment Protection → Vercel Authentication on, **Standard Protection** (guards previews and deployment URLs; furtli-web.vercel.app is this project's production address and uses the app password). Remove the exception and the bypass secret created earlier; they're no longer needed.
7. Domains: `furtli-web.vercel.app` stays here, assigned to Production. Remove `furtli.ch` if it was added to this project.

### 2. Production project (new)

1. Vercel → Add New → Project → import `patrikmc/furtli` again. Name e.g. `furtli`. Root Directory `apps/web`.
2. Settings → Environments → Production → Branch Tracking: `release`.
3. Settings → Environment Variables (**Production** only):

   | Variable | Type | Value |
   | --- | --- | --- |
   | `APP_ENV` | Config | `production` |
   | `DATABASE_URL` | Secret | `furtli-production`, **pooled** |
   | `SITE_PASSWORD` | Secret | password for friends |
   | `CRON_SECRET` | Secret | a different random value |
   | `RESEND_API_KEY` | Secret | production Resend key |
   | `NEXT_PUBLIC_SITE_URL` | Config | `https://furtli.ch` |
   | `EMAIL_FROM` / `EMAIL_REPLY_TO` / `EMAIL_CONTACT_ADDRESS` | Config | as above |
   | `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Config | Umami website id |
   | `NEXT_PUBLIC_UMAMI_DOMAINS` | Config | `furtli.ch,www.furtli.ch` |
   | `UMAMI_API_KEY` | Secret | Umami Cloud API key (weekly snapshot) |
   | `REPORT_SECRET` | Secret | random, for `/api/internal/weekly-report` |
   | `NOTION_TOKEN` | Secret | optional: Notion integration for the weekly report export |

   No `EMAIL_SUBJECT_PREFIX`. Don't connect the Neon integration to this project.
4. Ignored Build Step: same command as staging (`APP_ENV=production` makes it build `release` only).
5. Deployment Checks: `ci`, `e2e`, `migrate (production)` (appears in Vercel's list after the first push to `release`).
6. Deployment Protection: Vercel Authentication, Standard Protection.
7. Domains: add `furtli.ch` and `www.furtli.ch` (redirect to furtli.ch); create the DNS records Vercel shows at your registrar. Leave the MX/SPF/DKIM/DMARC records for email alone.

Note: Deployment Checks hold the build until the checks pass before assigning it to the production domains. Watch the first push to each project and confirm it waits.

### 3. Neon

- **Staging**: existing project, `production` branch renamed to `staging` (test data stays; the connection string doesn't change).
- **Production**: project `furtli-production`, EU region, only you have access. Before the first release, from the repo root:
  ```bash
  export DATABASE_URL_UNPOOLED='<furtli-production direct url>'
  pnpm db:migrate
  pnpm ingest
  unset DATABASE_URL_UNPOOLED
  ```
- Pooled string (`-pooler` in the host) → Vercel `DATABASE_URL`; direct string → GitHub `DATABASE_URL_UNPOOLED`.

### 4. GitHub (repo → Settings)

1. **Environments → `staging`**: deployment branches: selected → `master`; secret `DATABASE_URL_UNPOOLED` = staging branch, direct.
2. **Environments → `production`**: deployment branches: selected → `release`; secret `DATABASE_URL_UNPOOLED` = `furtli-production`, direct. Optional: required reviewer (you) — then each release waits for your click before migrating.
3. Delete the old environment `test`, and any repository secrets added for the earlier plan (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_AUTOMATION_BYPASS_SECRET`) and the environment secrets `CRON_SECRET` / `SITE_PASSWORD` / variable `SITE_URL`. None are used any more.
4. Recommended: **Rules → Rulesets** for `master` and `release`: block force pushes and deletion; for `master` also require the `ci` and `e2e` checks on pull requests.

### 5. First run

```bash
git push origin master   # staging project builds; Actions → CI runs ci ▶ e2e ▶ migrate
# furtli-web.vercel.app switches once all three are green → log in with the tester password
pnpm release             # production project builds; furtli.ch switches once CI is green
```

## Personal data (revDSG)

Subscribers' email addresses are personal data (not legal advice):

- Never copy production data into staging, previews or local databases. Test with your own, testers' (with their OK) or made-up addresses.
- Tell testers their address is only used for testing; clear staging after a test round: `DATABASE_URL_UNPOOLED='<staging direct url>' pnpm db:reset -- --user-data-only`.
- Neon keeps change history for restores (6 hours on Free, up to 7 days on Launch); a deleted address is fully gone only after that window.
- `/datenschutz` should list where data is stored and who processes it: Neon (region), Vercel, Resend, Umami.

## Day to day

- Share access: address + password via Signal/WhatsApp. New password: change `SITE_PASSWORD` in that Vercel project and redeploy; everyone re-enters it.
- Test reminders on staging: sign up on furtli-web.vercel.app with your own address for a PLZ with a collection tomorrow and confirm; the 16:00 UTC run sends it. To run it right away: `curl -H "Authorization: Bearer <staging CRON_SECRET>" "https://furtli-web.vercel.app/api/cron/emails?dryRun=1"` (drop `dryRun=1` to send, add `forceDigest=1` for the weekly overview). Or Vercel → Settings → Cron Jobs → Run.
- Cron logs: Vercel → project → Settings → Cron Jobs → View Logs.
- Going public: remove `SITE_PASSWORD` from the production project and redeploy.
