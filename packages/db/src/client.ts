import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * A single DATABASE_URL is the entire portability story: local Docker
 * Postgres, a Neon branch, or any other Postgres. The connection is created
 * lazily on first use, so importing this package never fails: the web app
 * can fall back to seed data when no database is configured, and tests can
 * point `DATABASE_URL` at their own database before the first query.
 *
 * `prepare: false` is required for connection poolers that don't support
 * prepared statements (Neon's pooled connection string, PgBouncer), and is
 * harmless against a plain local Postgres.
 */
export function createDb(url: string, opts: { max?: number } = {}) {
  const client = postgres(url, { prepare: false, max: opts.max ?? 5, onnotice: () => {} });
  return Object.assign(drizzle(client, { schema }), { $client: client });
}

export type Database = ReturnType<typeof createDb>;

let instance: Database | null = null;

export function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL;
}

/** The app-wide connection (from DATABASE_URL). Throws if it isn't configured. */
export function getDb(): Database {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to apps/web/.env.local (and packages/db/.env) — see the root README.",
    );
  }
  instance = createDb(url);
  return instance;
}

/** Closes the app-wide connection (CLI scripts and tests). */
export async function closeDb(): Promise<void> {
  if (instance) {
    await instance.$client.end({ timeout: 5 });
    instance = null;
  }
}
