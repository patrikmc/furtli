# Testing

Four layers, each one narrower and slower than the one before it. Run the
fast three constantly; reach for the fourth only for the couple of flows
where nothing else can catch a real regression.

## The pyramid

| Layer | Tool | What it touches | Where it lives | Runs in CI |
| --- | --- | --- | --- | --- |
| Unit | Vitest | Pure functions (YAML parsing, validation) | `packages/db/src/*.test.ts` | Yes |
| Component | Vitest + Testing Library | Rendered React, server boundaries mocked | `apps/web/**/*.test.tsx` | Yes |
| Integration | Vitest + real Postgres | Query/mutation functions against a real DB | `packages/db/src/*.integration.test.ts` | Yes |
| E2E | Playwright + `@clerk/testing` | A real browser, real running app, real Clerk test instance | `apps/web/e2e/*.spec.ts` | No (needs secrets, see below) |

Unit and component tests never touch a database or the network — they're
what you run in a tight loop while writing code. Integration tests hit a
real, disposable Postgres database and are still fast enough to run on
every save. E2E is the only layer that starts a real browser and a real
Clerk test instance over the network, which is also why it's the only
layer excluded from CI by default.

## Running the tests

```bash
# from the repo root — unit + component tests, every package
pnpm test

# just one package
pnpm --filter db test
pnpm --filter web test

# watch mode, for whichever package you're actively working on
pnpm --filter db test:watch
pnpm --filter web test:watch

# integration tests (packages/db only — needs a one-time setup, see below)
pnpm test:integration

# E2E (needs Clerk test-instance secrets, see below)
pnpm test:e2e
```

## How fast is "fast"?

Measured on this template's actual test suite, on an otherwise-idle
machine:

- **Unit** (`packages/db`, 8 tests): ~350ms, most of it import/transform
  overhead rather than the tests themselves.
- **Component** (`apps/web`, 4 tests): ~900ms — `happy-dom` plus React's
  render/commit cycle is the bulk of that.
- **Integration** (`packages/db`, 4 tests, real Postgres): ~950ms. The
  reset-between-tests strategy below is what keeps this from growing
  linearly as more tests get added.
- **Watch mode** re-runs on save in well under 100ms once Vitest's module
  graph is warm — this is the loop you actually live in day to day.

None of that is close to "E2E slow." A single Playwright test — cold
`next build`, then a real Chromium session round-tripping through a real
Clerk test instance — takes on the order of a minute, dominated by the
production build the `webServer` config kicks off. That's the tradeoff:
E2E only proves the pieces really work together, so keep it to a small
number of critical paths (this template ships exactly one) and lean on
the three fast layers for everything else. As the suite grows, unit and
component tests will stay in the same tens-to-hundreds-of-milliseconds
range; integration tests will grow closer to linearly with the number of
tests, since each one pays for a real round trip to Postgres — still
fast in absolute terms until the suite reaches the scale of hundreds of
integration tests, well beyond what a project this size needs.

## Integration tests: one-time setup, and why "reset" instead of "rollback"

Integration tests run against a dedicated `app_test` database — never
the `app` database you're looking at in the browser during dev. Create
it once (idempotent — safe to re-run):

```bash
pnpm --filter db db:test:setup
```

This creates `app_test` if it doesn't already exist and pushes the
current schema into it via `drizzle-kit push --force`, the same way CI's
throwaway Postgres service gets its schema. Re-run it any time the
schema changes.

Isolation between tests is a `DELETE FROM quizzes` in a `beforeEach`
(`packages/db/src/test/setup-integration.ts`) — cascading deletes in the
schema clean out `questions`, `choices`, `attempts`, and `answers` along
with it, so every test starts from an empty database. The alternative,
more common in larger codebases, is wrapping each test in a transaction
and rolling it back instead of deleting rows. That's typically faster at
scale, but it requires every function under test to accept an injectable
DB client/transaction rather than reaching for a module-level `db`
singleton — a bigger refactor than this template's current size
justifies. If the integration suite grows into the hundreds of tests and
the delete-per-test cost starts to show, that's the point to revisit it;
`packages/db/src/sync.ts` and `packages/db/src/quizzes.ts` are where the
`db` import would need to become a parameter.

## Component tests: what's real, what's mocked

A component test renders the real component tree with Testing Library,
but mocks two things at the module boundary: the Server Action import
(`./actions`) and `next/navigation`'s `useRouter`. That means a component
test never touches Clerk, the database, or the network — it's testing
"does this component behave correctly given these inputs and these
callbacks," not "does the whole request/response cycle work." The
integration and E2E layers are what cover the parts a component test
mocks away.

## E2E: one-time Clerk setup

E2E is the only layer that needs real, live Clerk credentials — it signs
in an actual test user against an actual Clerk test instance to prove
auth genuinely works end to end. Fill these into `apps/web/.env.local`
(see the comments in `.env.example`):

```
CLERK_PUBLISHABLE_KEY=       # same value as NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
                              # just also exposed under this unprefixed name —
                              # that's what @clerk/testing's helpers read
E2E_CLERK_USER_EMAIL=        # a test user's email ending in +clerk_test@...
```

`+clerk_test@` is Clerk's reserved testing-mode address format — it
always passes verification on a Clerk *test* instance, no real inbox
involved. Create that user once (sign up through the app, or add it in
the Clerk dashboard), then:

```bash
pnpm --filter db exec drizzle-kit push --force   # if you haven't already
pnpm db:seed                                     # world-capitals quiz needs to exist
pnpm test:e2e
```

The `webServer` config builds and starts the app itself, so `pnpm
test:e2e` is a single command — no separate `pnpm dev` needed. E2E is
deliberately left out of the default GitHub Actions workflow because it
needs those secrets configured as repo/org secrets first; once you're
ready to wire it in, add a `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` /
`E2E_CLERK_USER_EMAIL` set of repo secrets and add a job that mirrors
the steps above.
