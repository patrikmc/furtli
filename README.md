# startup-template

A solo-founder-ready starting point: Next.js + TypeScript + Tailwind, Clerk auth, Drizzle-managed Postgres, deployed via Vercel's git integration, background/email covered by Inngest/Trigger.dev + AWS SES when you need them. Built to be cloned fresh for every new project idea — see "Using this as a template" below.

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first** for the full reasoning behind every choice here (why Next.js as a full server app rather than static, why Postgres over DynamoDB for a startup, why each vendor was picked, and what it costs). [`docs/DATABASE.md`](docs/DATABASE.md) covers what Drizzle actually does and the Neon-vs-Supabase tradeoffs, if you want to reconsider that call. [`docs/TESTING.md`](docs/TESTING.md) covers the test pyramid (unit/component/integration/E2E), how to run each layer, and real measured speeds.

The scaffold ships with a real sample application, not just a "hello world" page — a quiz platform (`apps/web/app/quizzes`, `.../profile`, `.../admin`) exercising every layer of the stack: auth-gated routes, a normalized Postgres schema, server-side grading, aggregate queries, admin CRUD, and a git-friendly YAML content pipeline. **Read [`docs/QUIZZES.md`](docs/QUIZZES.md)** for how that content pipeline works, the admin correction workflow, and the human-in-the-loop step that keeps database edits in sync with git. If you're using this repo as a template for something else, the quiz app is meant to be deleted — everything else here doesn't depend on it.

## What's already wired up and validated

Everything below was actually built and tested — `pnpm install`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass, and `pnpm db:seed`/`pnpm db:export` were run end-to-end against a real local Postgres — against real, current package versions (Next.js 16, React 19, Clerk 7, Drizzle ORM 0.45, Zod 4) as of when this was generated:

- **`apps/web`** — Next.js App Router, TypeScript, Tailwind v4. A landing page, Clerk sign-in/sign-up pages, and the quiz app's routes (`/quizzes`, `/profile`, `/admin`) protected by `proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts` — if you're on Next.js ≤15, rename it back and see the comment at the top of that file).
- **`packages/db`** — Drizzle ORM schema for the quiz domain (`quizzes`/`questions`/`choices`/`attempts`/`answers`), a generated migration, a YAML content pipeline (`content.ts`/`sync.ts`, validated with Zod), seed/export scripts, and a Postgres client that works unmodified against local Docker Postgres, Neon, or Supabase — just a `DATABASE_URL` away.
- **A working, non-trivial example**: sign up, browse `/quizzes`, take one, get graded server-side (the client never receives the correct answers — see `docs/QUIZZES.md`), see your score alongside the quiz-wide average, check `/profile` for your overall stats, and — as an admin — see aggregated results across all users and correct a wrong answer from `/admin`.
- **`content/quizzes/*.yaml`** — three sample quizzes (world capitals, composer nationalities, decade-of-birth), the format `pnpm db:seed` and the admin UI both read/write.
- **`docker-compose.yml`** — local Postgres, for the fully-offline dev loop.
- **Tests** — Vitest unit tests (`packages/db`), Vitest + Testing Library component tests (`apps/web`), Vitest integration tests against a real Postgres (`packages/db`), and a Playwright + `@clerk/testing` E2E test (`apps/web`). All actually run — see `docs/TESTING.md` for real measured speeds and how to run each layer.
- **`.github/workflows/ci.yml`** — lint, unit/component/integration tests, typecheck, and a full production build on every PR, against a real Postgres service container. E2E is excluded by default (needs Clerk test-instance secrets — see `docs/TESTING.md`).
- **`infra/`** — Terraform for the one piece that's genuinely worth IaC-ing at this stage (AWS SES). See `infra/README.md` for why Vercel/Clerk/Neon/Supabase are dashboard-first instead.

## Quickstart

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Local database:**
   ```bash
   docker compose up -d
   cp .env.example apps/web/.env.local
   cp .env.example packages/db/.env
   # edit both — at minimum DATABASE_URL is already correct for the default
   # docker-compose setup; fill in the Clerk keys (next step) in apps/web/.env.local
   pnpm db:generate   # only needed after you change packages/db/src/schema.ts
   pnpm db:migrate
   pnpm db:seed       # loads content/quizzes/*.yaml — see docs/QUIZZES.md
   ```

3. **Clerk (auth):** create a free application at [dashboard.clerk.com](https://dashboard.clerk.com), copy the publishable and secret keys into `apps/web/.env.local`. To try the admin dashboard (`/admin`), also set your user's public metadata to `{"role": "admin"}` — see `docs/QUIZZES.md`.

4. **Run it:**
   ```bash
   pnpm dev
   ```
   Visit `localhost:3000`, sign up, and you'll land on `/quizzes` with three sample quizzes backed by your local Postgres.

## Testing

```bash
pnpm test              # unit + component tests, every package — fast, no DB, no network
pnpm test:integration  # packages/db tests against a real, disposable Postgres
pnpm test:e2e          # Playwright + Clerk, a real browser against the real app
```

`pnpm test` and `pnpm test:integration` are what CI runs on every PR. `pnpm test:integration` needs a one-time `pnpm --filter db db:test:setup` first (creates a throwaway `app_test` database), and `pnpm test:e2e` needs Clerk test-instance credentials filled into `apps/web/.env.local`. **See [`docs/TESTING.md`](docs/TESTING.md)** for the full pyramid, the one-time setup for each layer, real measured speeds, and why E2E isn't in CI by default.

## Going from local to deployed

1. **Database**: create a Neon project (see `docs/DATABASE.md` for why Neon over Supabase, and when that call would flip) — or Supabase if you've decided otherwise. Copy its pooled connection string into Vercel's environment variables as `DATABASE_URL` (separately for Preview and Production if you want per-PR branches — Neon's GitHub integration can automate creating one automatically).
2. **Auth**: same Clerk keys, added to Vercel's environment variables. Clerk's free tier explicitly supports production/commercial use up to 50,000 monthly users — no separate "prod" account needed.
3. **Deploy**: connect this repo to Vercel via their dashboard. That's the entire deploy pipeline — every PR gets a preview URL, every merge to `main` deploys to production, no workflow YAML required. `.github/workflows/ci.yml` still runs alongside it as the lint/typecheck/build gate.
4. **Email (when you need it)**: `cd infra`, follow `infra/README.md`, `terraform apply`, then add the printed DNS records at your domain's DNS provider.
5. **Migrations against the real database**: run `pnpm db:migrate` with `DATABASE_URL` pointed at Neon/Supabase — either locally before you push, or as a manual step in a workflow if you want migrations to run in CI rather than from your laptop. Deliberately not automatic-on-deploy: a bad migration should never run silently against production just because a deploy happened to also ship that day.

## Using this as a template for future projects

This repo is meant to be cloned fresh, not extended in place, for every new idea — that's the "minimize startup time across projects" goal from the outset. On GitHub: mark this repo as a **template repository** (Settings → Template repository), then "Use this template" gives you a new, fully-structured repo in under a minute. Rename the `web` and `db` package names in their `package.json`s, update `infra/variables.tf`'s `project_name` default, and you're building.

## Structure

```
apps/
  web/            Next.js app — the whole product for now (frontend + Server Actions as the backend)
                   app/quizzes, app/profile, app/admin — the sample quiz app (see docs/QUIZZES.md)
packages/
  db/             Drizzle schema, migrations, the YAML content pipeline (content.ts/sync.ts/seed.ts/export.ts),
                   and the Postgres client shared by web (and any future service)
content/
  quizzes/        Quiz content as YAML — the source of truth `pnpm db:seed` loads from
infra/            Terraform for AWS SES (see infra/README.md for what's intentionally NOT here)
docker-compose.yml  Local Postgres
.github/workflows/ci.yml  lint + tests (unit/component/integration) + typecheck + build on every PR
docs/
  ARCHITECTURE.md   Full reasoning for every stack choice, cost breakdown, scaling story
  DATABASE.md       What Drizzle does, and the Neon-vs-Supabase considerations in depth
  QUIZZES.md        The quiz app: content pipeline, corrections, admin access
  TESTING.md        The test pyramid, how to run each layer, real measured speeds
```
