import postgres from "postgres";
import { TEST_DATABASE_URL } from "./test-db";

/**
 * One-time (idempotent) setup: creates the `app_test` database if it
 * doesn't already exist, connecting through the default `postgres`
 * maintenance database to do it — you can't run `CREATE DATABASE` while
 * connected to the database you're creating. Safe to run repeatedly;
 * "already exists" (Postgres error 42P04) is treated as success, not a
 * failure, so this can sit at the front of `db:test:setup` unconditionally.
 *
 * Run via `pnpm db:test:setup` (which also pushes the current schema
 * into it afterward) — a one-time step before `pnpm test:integration`
 * works locally. CI does the equivalent with its own throwaway Postgres
 * service container instead of this script.
 */
async function main() {
  const maintenanceUrl = TEST_DATABASE_URL.replace(/\/[^/]+$/, "/postgres");
  const client = postgres(maintenanceUrl, { prepare: false, max: 1 });

  const dbName = TEST_DATABASE_URL.split("/").pop()!;

  try {
    await client.unsafe(`CREATE DATABASE ${dbName}`);
    console.log(`Created database "${dbName}".`);
  } catch (err) {
    const pgError = err as { code?: string };
    if (pgError.code === "42P04") {
      console.log(`Database "${dbName}" already exists — nothing to do.`);
    } else {
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
