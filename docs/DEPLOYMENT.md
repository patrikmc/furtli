# Deployment: staging and production

| | Staging | Production |
| --- | --- | --- |
| Git branch | `master` | `release` |
| Address | https://furtli-web.vercel.app | https://furtli.ch (+ www) |
| Vercel environment | custom environment `staging` | Production |
| Neon | existing project, branch `staging` | separate project `furtli-production` |
| GitHub environment | `staging` | `production` |
| Access | app password gate (`SITE_PASSWORD`) | app password gate (own `SITE_PASSWORD`) |
| Reminder emails | yes, 16:00 UTC daily via GitHub Actions (`staging-emails.yml`), subject starts with `[Staging]` | yes, 16:00 UTC daily via Vercel Cron |
| Data | your and testers' test sign-ups | real sign-ups only; starts empty |
| Search engines | `X-Robots-Tag: noindex` | indexable (once public) |

## Access: the app's own password gate

Vercel's Password Protection costs USD 20/month per project, so the app has its own (free) gate instead:

- `apps/web/proxy.ts` + `apps/web/lib/access.ts`: with `SITE_PASSWORD` set, every page redirects to **/zugang** (a Furtli-styled password page) and every API call answers 401 until the password has been entered. Entering it sets an HttpOnly cookie for 90 days (an HMAC of the password, not the password itself).
- Changing `SITE_PASSWORD` in Vercel and redeploying logs everyone out. Removing it switches the gate off (the day Furtli goes public).
- Open without the password (each has its own protection): `/zugang`, `/api/cron/*` and `/api/ingest` (CRON_SECRET), `/api/email/*` and `/abo/*` (per-subscriber tokens; Gmail's one-click unsubscribe POSTs without cookies), and static files (fonts, `geo/` data, icons).
- Scripts (smoke test) send the password as the header `x-furtli-access`.
- Vercel Authentication (free) stays on as a second layer, with scope **Standard Protection**: it guards PR previews and the unique deployment URLs, but not furtli.ch.

## How a change travels

```
feature branch ──PR──▶ CI + Vercel preview (git integration, protected)
      │ merge
      ▼
   master ──push──▶ Deploy workflow: CI ▶ migrate staging DB ▶ vercel deploy --target=staging ▶ smoke test
      │ pnpm release   (fast-forwards release to master)
      ▼
   release ─push──▶ Deploy workflow: CI ▶ migrate furtli-production ▶ vercel deploy --prod ▶ smoke test
```

- `.github/workflows/deploy.yml` — the pipeline above. Each stage needs the previous one, so a red test or a failed migration never reaches the site. Re-run by hand: Actions → Deploy → Run workflow → pick the branch.
- `.github/workflows/ci.yml` — tests; runs on PRs and as stage 1 of every deploy.
- `.github/workflows/db-migrate.yml` — migrations; stage 2 of every deploy, or by hand for one environment.
- `scripts/promote-release.sh` (`pnpm release [sha]`) — shows what's new since the last release, checks that staging deployed that commit, then pushes it to `release`. Fast-forward only: `release` never has commits `master` doesn't.
- `.github/workflows/staging-emails.yml` — sends staging's reminders (Vercel runs crons on production only). Daily at 16:00 UTC, or by hand with *dry run* / *force digest*.
- `pnpm db:reset` (`packages/db/src/scripts/reset.ts`) — empties a database (asks you to type its host first). For staging, e.g. to clear testers' sign-ups after a test round.
- `scripts/smoke-test.sh` — after deploying: the new build serves `/` and `/api/stations` from the database, the site refuses visitors without the password (redirect to /zugang, 401 on the API), and serves the app with it.
- `apps/web/vercel.json` → `git.deploymentEnabled` turns off Vercel's own deploys for `master` and `release` (GitHub Actions deploys them). PR previews still come from Vercel's git integration.

**Hotfix:** fix on a branch → PR → merge to master → staging goes green → `pnpm release`. Same path, just faster.
**Rollback:** Vercel → Deployments → pick the previous production deployment → Instant Rollback (seconds, no rebuild). Then revert on master and release normally. Migrations don't roll back — write them to be backward compatible (add columns first, remove them a release later).

## One-time setup

Do these in order. Values in `<>` are yours.

### 1. Vercel project (Pro plan, one project for both environments)

1. Skip if the project exists already. Otherwise: Vercel → Add New → Project → import `patrikmc/furtli`. Root Directory: `apps/web`. Framework: Next.js (the rest comes from `vercel.json`).
2. Settings → Environments → **Production** → Branch Tracking: `release`.
3. Settings → Environments → **Create Environment** → name `staging`. Branch Tracking: `master` (the git integration is off for master, so this only labels it). Don't import variables — set them fresh in step 4.
4. Settings → Environment Variables. Set per environment (Production / staging); Preview gets its own values for PR previews.

   | Variable | Production | staging |
   | --- | --- | --- |
   | `DATABASE_URL` | Neon project `furtli-production`, **pooled** | staging project, branch `staging`, **pooled** |
   | `SITE_PASSWORD` | the password you give your close circle | its own password (or the same) |
   | `NEXT_PUBLIC_SITE_URL` | `https://furtli.ch` | `https://furtli-web.vercel.app` |
   | `CRON_SECRET` | random, 32+ chars | a different random value |
   | `RESEND_API_KEY` | live key | a second Resend key (same account and domain), so staging sends real emails |
   | `EMAIL_SUBJECT_PREFIX` | leave unset | `[Staging] ` (with the trailing space) |
   | `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_CONTACT_ADDRESS` | as in `.env.example` | same |
   | `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, `NEXT_PUBLIC_UMAMI_DOMAINS` | `furtli.ch,www.furtli.ch` | leave unset (no tracking on staging) |
   | `NEXT_PUBLIC_MAP_STYLE_URL` | optional | optional |

   Also: Settings → Environment Variables → **Automatically expose System Environment Variables** on (the noindex header reads `VERCEL_TARGET_ENV`).
   Set `SITE_PASSWORD` for **Preview** too if PR previews should behave the same (optional: they're behind Vercel Authentication anyway).
5. Settings → Deployment Protection (all free):
   - **Vercel Authentication** → on → scope **Standard Protection** (not "All Deployments", which would ask everyone on furtli.ch for a Vercel login). Password Protection stays **off**.
   - **Deployment Protection Exceptions** → add `furtli-web.vercel.app`. Standard Protection covers every non-production address, staging included; the exception leaves staging to the app's password gate, so your close circle can open it and one-click unsubscribe works there. Don't use Vercel's Shareable Links for testers: they only work in the browser where the link was opened, so confirm/unsubscribe links from emails would hit a Vercel login.
   - **Protection Bypass for Automation** → Create → label "GitHub deploy" → copy the secret (step 4 of GitHub setup). The smoke test needs it for the unique deployment URL.
6. Account Settings → Tokens → create a token "github-actions-furtli", scope: your team, expiry 1 year (put the renewal in your calendar).
7. On your Mac, from the repo root: `pnpm dlx vercel link` → pick the project. `cat .vercel/project.json` shows `orgId` and `projectId` (`.vercel/` is git-ignored: `vercel pull` writes env files with secrets there).

### 2. Addresses and DNS

1. **Staging** stays on the Vercel address: Settings → Domains → `furtli-web.vercel.app` → Edit → Environment: **staging**. (A new project assigns it to Production; production moves to furtli.ch in the next step.) If Vercel doesn't offer the staging environment for it, add another free address such as `furtli-web-staging.vercel.app` → Environment: staging, and use that everywhere this guide says furtli-web.vercel.app.
2. **Production**: Add `furtli.ch` (Production) and `www.furtli.ch` (redirect to furtli.ch). Vercel shows the DNS records to create at your registrar, usually an `A` record for `furtli.ch` and a `CNAME` for `www`. Wait for "Valid Configuration"; Vercel issues the certificates.
3. Don't touch the MX/SPF/DKIM/DMARC records for email (Resend).
4. A staging subdomain (staging.furtli.ch) can come later: add it with Environment: staging, a `CNAME` at the registrar, then update `SITE_URL` / `NEXT_PUBLIC_SITE_URL` and the protection exception.

### 3. Neon: two separate projects

Production and staging live in **separate Neon projects**, so real subscribers' email addresses never share a project, change history, credentials or branches with test data. Data only ever flows one way: nothing is copied from production into staging (see "Personal data" below).

**Staging** — the existing project (the one with your test data):
1. Rename its `production` branch to `staging` (Branches → ⋯ → Rename). Nothing is copied; your test sign-ups stay where they are.
2. If your local `.neon` file names that branch, update it to `staging`.
3. PR previews: if the Neon–Vercel integration creates a branch per preview, it branches from this project, so previews only ever see test data.

**Production** — the new project `furtli-production`:
1. Region: an EU region (e.g. AWS Frankfurt). The region can't be changed later; if it was created elsewhere, recreate it now while it's empty.
2. Before the first release, create the tables and load the open data (from the repo root, with the project's **direct** connection string):
   ```bash
   export DATABASE_URL_UNPOOLED='<furtli-production direct url>'
   pnpm db:migrate
   pnpm ingest
   unset DATABASE_URL_UNPOOLED
   ```
   After that, the Deploy workflow migrates it on every release.
3. Access: only you. Don't use this connection string in local `.env` files; local dev and tests use Docker or the staging project.

**Connection strings**, for each database: **pooled** (`-pooler` in the host) → Vercel `DATABASE_URL`; **direct** → GitHub `DATABASE_URL_UNPOOLED`.

**Check the Neon–Vercel integration**: if it is installed, it may write `DATABASE_URL` into Vercel itself. Make sure Vercel's **Production** `DATABASE_URL` points to `furtli-production` (and staging's to the staging branch). If the integration keeps overwriting Production, limit it to Preview in its settings.

### 4. GitHub (repo → Settings)

1. **Secrets and variables → Actions → Repository secrets**:
   - `VERCEL_TOKEN` — from 1.6
   - `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` — from 1.7
   - `VERCEL_AUTOMATION_BYPASS_SECRET` — from 1.5 (the smoke test and staging emails use it to pass Vercel Authentication)
2. **Environments** → New environment `staging`:
   - Secret `DATABASE_URL_UNPOOLED` = staging project, branch `staging`, direct
   - Secret `CRON_SECRET` = the same value as `CRON_SECRET` in the Vercel staging environment
   - Secret `SITE_PASSWORD` = the same value as in the Vercel staging environment
   - Variable `SITE_URL` = `https://furtli-web.vercel.app`
   - Deployment branches: Selected → `master`
3. New environment `production`:
   - Secret `DATABASE_URL_UNPOOLED` = `furtli-production`, direct
   - Secret `SITE_PASSWORD` = the same value as in Vercel Production
   - Variable `SITE_URL` = `https://furtli.ch`
   - Deployment branches: Selected → `release`
   - Optional: Required reviewers → you. Then every production deploy (and its migration) waits for one click in the Actions tab.
4. The old environment `test` (used by the previous db-migrate workflow) can be deleted once its secret has moved to the right environment above.
5. Optional, recommended: **Branches → Add rule** for `release`: restrict who can push (you), no force pushes, no deletion. For `master`: require the `CI` check on PRs.

### 5. First run

```bash
git push origin master        # → staging deploy; watch Actions → Deploy
# open https://furtli-web.vercel.app, enter the password, check the map
pnpm release                  # → creates release, production deploy
```

## Personal data (revDSG)

Subscribers' email addresses are personal data. Rules for this setup (not legal advice):

- Never copy production data into staging, previews or local databases. Test with your own addresses, testers' addresses (with their OK) or made-up ones.
- Tell testers their address is only used for testing, and clear staging after a test round: `DATABASE_URL_UNPOOLED='<staging direct url>' pnpm db:reset -- --user-data-only`.
- Neon keeps change history for restores (6 hours on Free, up to 7 days on Launch). A deleted address is fully gone only after that window. Mention it on `/datenschutz` if you answer deletion requests.
- `/datenschutz` should list where data is stored and who processes it: Neon (region), Vercel, Resend, Umami.

## Day to day

- Share access: send the address + password (Signal/WhatsApp, not in public posts). New password: change `SITE_PASSWORD` in Vercel **and** in the GitHub environment, then redeploy (Actions → Deploy → Run workflow); everyone has to enter the new one.
- Going public later: remove `SITE_PASSWORD` from Vercel Production and redeploy, and set the GitHub `production` environment variable `EXPECT_PROTECTED=false` so the smoke test expects a public site. Staging keeps its gate.
- Test reminders on staging: sign up on furtli-web.vercel.app with your own address for a PLZ that has a collection tomorrow, confirm, then Actions → Staging emails → Run workflow (first with *dry run* to see what would go out, then for real; *force digest* for the Sunday overview). The run summary shows the response with how many were sent.
- Cron check after the first production deploy: Vercel → Settings → Cron Jobs → `/api/cron/emails` → View Logs. The next 16:00 UTC run should log a 200 (dry run by hand: `curl -H "Authorization: Bearer $CRON_SECRET" "https://furtli.ch/api/cron/emails?dryRun=1"` — the cron path is open in the password gate).
- GitHub turns off scheduled workflows after 60 days without commits to the repo. If staging emails stop, re-enable the workflow in the Actions tab.
- Email links: confirm and unsubscribe work without the password (token links); links to the map lead to /zugang first — fine for the close circle, who know the password.
