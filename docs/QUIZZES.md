# The quiz app: content pipeline, corrections, and admin

This describes the sample application built on top of the template —
`apps/web`'s quiz routes, `packages/db`'s quiz schema, and the YAML
content pipeline that ties them together. If you're using this repo as a
template for a different product, everything in this file is specific to
the sample app and safe to delete; `docs/ARCHITECTURE.md` and
`docs/DATABASE.md` describe the parts of the stack you'll keep.

## Data model

Five tables, in `packages/db/src/schema.ts`:

- **`quizzes` / `questions` / `choices`** — the catalogue. This is what
  the YAML content pipeline and the admin UI both write to.
- **`attempts` / `answers`** — live user data: one row per completed
  quiz, one row per question answered. Never touched by the content
  pipeline, never exported to YAML.

`attempts.scorePercentage` and `answers.isCorrect` are computed once, at
grading time, and then frozen — they're a historical record of what was
true when the user took the quiz, not a live view recalculated against
today's answer key. That distinction matters the moment an admin corrects
a mistake; see "Correcting a wrong answer" below.

## The YAML format

One file per quiz under `content/quizzes/`. Three examples ship with the
template: `world-capitals.yaml`, `composer-nationalities.yaml`,
`decade-born.yaml`.

```yaml
slug: world-capitals          # permanent identity — the URL is /quizzes/<slug>
title: World Capitals
description: Match each country to its capital city.
category: Geography           # optional
thumbnailUrl: https://...     # optional
coverImageUrl: https://...    # optional

questions:
  - key: france                # optional — see "Why `key` matters" below
    prompt: What is the capital of France?
    choices:
      - text: Lyon
      - text: Paris
        correct: true           # exactly one choice per question must be correct: true
      - text: Marseille
      - text: Nice
```

Validation (`packages/db/src/content.ts`, using Zod) rejects a file where
`slug` isn't lowercase-kebab-case, a question has fewer than 2 choices,
zero or more than one choice is marked correct, or any required field is
empty — with the exact file and field named in the error. It's fail-fast
on purpose: `pnpm db:seed` stops before writing anything if any file in
the directory is invalid, rather than partially loading good files and
silently skipping bad ones.

### Why `key` matters

`key` is optional and defaults to the item's position in the list (`"0"`,
`"1"`, ...). It becomes the row's `contentKey` in the database — a stable
identity independent of the row's real database id, used to match "this
YAML question" to "that database row" across repeated seed runs.

With explicit keys, editing a question's wording or fixing an answer and
re-running `pnpm db:seed` **updates the existing row** — same database
id, same foreign keys, so every `answers` row that already points at that
question's choices stays valid. Without keys (or if you reorder questions
without adding keys), a reseed can't tell "this is the same question,
edited" from "this is a different question that happens to be in the same
position," and position-based matching becomes unreliable for anything
except a full deliberate replacement. Give a quiz explicit keys once you
plan to hand-correct it — the three sample quizzes all key their
questions for exactly this reason.

## Commands

```bash
pnpm db:seed      # load content/quizzes/*.yaml into the database (idempotent — safe to re-run)
pnpm db:export    # write the database's current catalogue back to content/quizzes/*.yaml
```

Both need `DATABASE_URL` set (via `packages/db/.env` or the environment)
and read/write `content/quizzes/` by default — override with the
`CONTENT_DIR` environment variable to point at a different directory
(useful for testing against a scratch folder before touching real
content).

`pnpm db:seed` against a brand-new, empty database builds the entire
catalogue from scratch — this is what makes "populate a new database"
a one-command operation for a fresh test environment, a new developer's
laptop, or disaster recovery.

## Correcting a wrong answer

Two ways to do it, and they end up in the same place:

**Edit the YAML file directly**, change which choice has `correct: true`,
then run `pnpm db:seed`. Review the diff like any other code change (it's
a normal git commit), and it ships the next time you deploy.

**Use the admin UI** (`/admin/quizzes/<slug>/edit`, needs the admin role —
see below): flip the radio button next to the correct choice, save. This
writes straight to the live database, so the fix is live for every user
immediately — no deploy needed. The tradeoff is the one described next.

### The step a running web app can't do for you

A deployed Next.js app has no way to `git commit` on its own. If you fix
an answer through the admin UI and stop there, the live database is
correct — but `content/quizzes/<slug>.yaml` in git still has the old,
wrong answer. The fix survives until the next time *anything* reseeds
from that file: a new test environment, a teammate's fresh laptop setup,
a disaster-recovery restore. At that point the mistake comes back.

The fix is one extra step, and it's manual by design (a script silently
committing to your repository on your behalf would be a much worse
default than asking you to review a diff first):

```bash
pnpm db:export                    # rewrites content/quizzes/*.yaml from the live database
git diff content/quizzes/         # review — should be exactly your admin-UI edit
git add content/quizzes/ && git commit -m "Fix world-capitals: France answer"
git push
```

This is also why the admin edit page shows a live "Replace from YAML"
panel prefilled with the quiz's current exported state: it's the exact
text `pnpm db:export` would produce, so you can eyeball it, copy it, or
paste a bigger edit back in, without leaving the browser.

**Rule of thumb:** admin-UI edits are for speed (fix it now, for
everyone, immediately). `pnpm db:export` + commit is what makes that fix
permanent. Do the second step before you consider a correction "done" —
otherwise it's one reseed away from silently reverting.

### What happens to attempts already on the books

Nothing. `answers.isCorrect` was set when that user completed the quiz
and is never recalculated. Their results screen still says they got that
question right (or wrong) based on what was true *then*. The results page
also compares each historical answer against the *current* answer key and
shows a small note ("the answer key for this question has been updated
since you took this quiz") whenever a correction has made the two
disagree — so a user re-visiting an old result isn't confused by an
apparent contradiction, without rewriting history to make it disappear.

## Admin access

There's no separate admin table — it's a single field on the Clerk user:

1. [dashboard.clerk.com](https://dashboard.clerk.com) → your application → **Users**
2. Pick a user → **Edit** next to Public metadata
3. Set it to `{"role": "admin"}`, save

`apps/web/lib/admin.ts` checks `currentUser().publicMetadata.role ===
"admin"` on every admin page and every admin Server Action — never
trusted from the client. This is a pragmatic choice for a template
(one dashboard edit, no Clerk session-claim/JWT-template configuration
required); if you outgrow a single `role` field, the natural next step is
a real roles/permissions table, at which point `lib/admin.ts` is the only
file that needs to change.

Signed-in non-admins get a 404 on `/admin/*`, not a "forbidden" page —
deliberately, so the route's existence isn't signaled to users who
shouldn't see it.

## Adding a new quiz

Same two paths as corrections:

- Add a new `content/quizzes/<slug>.yaml` file, run `pnpm db:seed`, commit
  the file. This is the "designed for git review" path — the new quiz is
  a normal PR.
- Use `/admin/quizzes/new`, paste YAML (the page includes a starter
  template), save. It's live immediately. Follow up with `pnpm db:export`
  + commit, same as any other admin-UI change, to make it permanent.

## Grading: what the server does and doesn't trust

`app/quizzes/[slug]/play/actions.ts` is the only place a score gets
written. It never trusts anything the client says about correctness —
the client only ever sends `{ questionId: choiceId }` pairs. The action
re-fetches the real question/choice/`isCorrect` data itself, validates
that each submitted `choiceId` actually belongs to the `questionId` it
was submitted against, and computes the score from that. `isCorrect` is
never included in the payload sent to the browser while a quiz is being
played (`lib/quizzes.ts`'s `getQuizForPlay` explicitly restricts the
selected columns) — so there's nothing to inspect in dev tools that would
reveal the answer before submitting, either.
