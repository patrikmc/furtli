# Database: Drizzle, and Neon vs. Supabase

## What "a Drizzle-managed Postgres schema" means

Drizzle is a TypeScript ORM — a library that lets you define your database tables as TypeScript code and get fully-typed query results back, instead of writing raw SQL strings and hoping the shape of what comes back matches what your code expects. Three pieces work together:

**The schema (`packages/db/src/schema.ts`).** You declare each table as a plain TypeScript object:

```ts
export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull(),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
});
```

This is the single source of truth for your database structure — not a database you clicked together in a GUI, not a `.sql` file you hand-maintain. It's regular TypeScript, so it's reviewable in a PR diff exactly like any other code change, which is exactly the "changes go through git, review, then a pipeline" workflow you wanted from the very start of this project.

**Migrations, generated from the schema (`drizzle-kit generate`).** You don't write `ALTER TABLE` statements by hand. You change `schema.ts`, run `drizzle-kit generate`, and Drizzle diffs your new schema against the last migration and writes the SQL that gets you from one to the other, as a numbered file in `packages/db/migrations/`. Those generated `.sql` files get committed to git and are what actually runs against a real database (`drizzle-kit migrate`) — the schema file is the *intent*, the migration files are the *history of how the database got there*. This scaffold's real, generated example is `packages/db/migrations/0000_*.sql` — produced from the actual quiz app schema (`quizzes`/`questions`/`choices`/`attempts`/`answers` in `packages/db/src/schema.ts`), not the toy `notes` table above; see `docs/QUIZZES.md` for what that schema is for.

**The client, typed from the schema (`packages/db/src/client.ts`).** `drizzle(client, { schema })` gives you back a `db` object where every query is checked against your actual table shapes at compile time — `db.select().from(notes).where(eq(notes.title, 123))` is a type error before you even run it, because `title` is a `text` column and `123` is a number. This is the actual payoff: the schema isn't just documentation, the compiler enforces it everywhere you touch the database.

**Why Drizzle specifically, over the other popular choice (Prisma):** Drizzle is pure TypeScript/JavaScript with no separate query-engine binary — Prisma historically ships a Rust binary that has to start up alongside your code, which adds real cold-start latency in serverless functions (exactly the environment Vercel runs your app in). Drizzle's queries also read close to SQL rather than through a heavier abstraction layer, which matters once you're debugging a slow query or want to understand exactly what's being sent to Postgres.

**Why this makes Neon/Supabase/local Docker interchangeable:** none of the above cares where `DATABASE_URL` points. Local Docker Postgres, a Neon connection string, and a Supabase connection string are all "just Postgres" as far as Drizzle is concerned — same schema, same generated migrations, same typed queries, in all three places. That portability is what makes the Neon-vs-Supabase decision below lower-stakes than it might feel: switching later is a connection-string change, not a rewrite.

## Neon vs. Supabase — the actual considerations

Both are managed, serverless-friendly Postgres. The differences that matter for a solo founder:

**Scope of the product.** Neon is *just* a Postgres platform, built around one core idea (instant branching) and done well. Supabase is a full backend-as-a-service — Postgres plus its own Auth, Storage, Realtime subscriptions, auto-generated REST/GraphQL APIs, and Edge Functions, all bundled. Since you've already picked Clerk for auth, Supabase's bundled auth is a feature you'd be paying (in complexity, not necessarily dollars) for and not using — which is the concrete reason I lean Neon for *this* stack specifically. If you ever start a different project where you want one vendor for the whole backend instead of assembling best-of-breed pieces, that calculus flips and Supabase's bundling becomes the selling point rather than the wasted feature.

**Branching.** Neon's core differentiator is genuinely instant, copy-on-write database branching — a full isolated copy of your data in seconds, cheap because it doesn't actually copy the data until something diverges. This is what makes "a Neon branch per PR" a realistic default (their GitHub integration automates it). Supabase has added branching too, but it's a newer, less central part of their product than it is for Neon — check Supabase's current branching plan/pricing tier requirements before assuming parity here, since this has been an area of active change for both vendors.

**Scale-to-zero philosophy.** Neon's compute scales to zero automatically as a core, always-on feature of the product, on both free and paid tiers — that's the whole basis of its pricing model. Supabase's free tier pauses a whole *project* after a week of inactivity (an idle penalty, not a cost optimization — see `docs/COST-ESTIMATE.md`-style tradeoffs from the earlier AWS discussion), and its paid tiers are more oriented toward always-on compute by default. If "scales smoothly to exactly zero cost when idle" is a priority for you specifically, that's a structural argument for Neon.

**Local development / CLI tooling.** Here Supabase is arguably ahead: the Supabase CLI spins up a faithful local replica of the *entire* platform (Postgres, Auth, Storage, Realtime) via Docker with one command, which is a very polished "local-first" experience if you're using their bundled features. Since this template already gets local dev "for free" from Drizzle + plain Docker Postgres (see `docker-compose.yml`) without needing Supabase's tooling at all, this advantage doesn't weigh in Neon's disfavor for *this* setup, but it's a real point in Supabase's favor if you go all-in on their platform elsewhere.

**Postgres extensions.** Supabase leans into and prominently supports extensions like `pgvector` (embeddings/vector search) and PostGIS out of the box — worth knowing if an AI-search or geo feature is anywhere on your roadmap. Neon supports common extensions too, but it's not marketed as a differentiator the way Supabase treats it.

**My actual pick for this template, given you've already chosen Clerk:** Neon. The bundling argument for Supabase evaporates once auth is already Clerk's job, and Neon's branching lines up specifically with the GitOps-per-PR workflow this whole project has been built around since the cert-lab. If a future project wants one vendor to do everything (including auth), that's the moment to revisit Supabase — not a reason to avoid it here.
