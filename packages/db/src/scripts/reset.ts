import "dotenv/config";
import { createInterface } from "node:readline/promises";
import postgres from "postgres";

/**
 * Empties a database so it starts fresh (meant for staging and local dev,
 * e.g. to clear testers' sign-ups after a test round): every table is truncated and the id
 * counters restart at 1. The schema and the migration history stay, so no
 * re-migration is needed. Afterwards reload the open data with `pnpm ingest`.
 *
 *   DATABASE_URL_UNPOOLED=<neon direct url> pnpm db:reset
 *   DATABASE_URL_UNPOOLED=<neon direct url> pnpm db:reset -- --user-data-only
 *
 * --user-data-only  keep stations/calendars, remove only subscribers + email log
 *
 * Asks you to type the database host before deleting anything. Without a
 * terminal (CI), set CONFIRM_HOST=<host> instead.
 */

const ALL_TABLES = ["email_log", "subscriber", "collection_event", "station", "ingest_run", "source_file"];
const USER_TABLES = ["email_log", "subscriber"];

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL_UNPOOLED (or DATABASE_URL) to the database you want to empty.");

  const host = new URL(url).hostname;
  const tables = process.argv.includes("--user-data-only") ? USER_TABLES : ALL_TABLES;
  const sql = postgres(url, { max: 1, onnotice: () => {} });

  try {
    console.log(`\nDatabase: ${host}${new URL(url).pathname}`);
    console.log("Rows that will be deleted:");
    for (const t of tables) {
      const [{ exists }] = await sql`select to_regclass(${`public.${t}`}) is not null as exists`;
      const n = exists ? (await sql`select count(*)::int as n from ${sql(t)}`)[0].n : "(table missing)";
      console.log(`  ${t.padEnd(18)} ${n}`);
    }

    let typed = process.env.CONFIRM_HOST;
    if (typed === undefined) {
      if (!process.stdin.isTTY) throw new Error("No terminal: set CONFIRM_HOST=<host> to confirm.");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      typed = await rl.question(`\nThis cannot be undone. Type the host to confirm (${host}): `);
      rl.close();
    }
    if (typed.trim() !== host) {
      console.log("Host didn't match. Nothing deleted.");
      process.exitCode = 1;
      return;
    }

    await sql.unsafe(`truncate table ${tables.map((t) => `"${t}"`).join(", ")} restart identity cascade`);
    console.log(`✓ Emptied ${tables.length} tables on ${host}.`);
    if (tables === ALL_TABLES) console.log("Next: load the open data with the same DATABASE_URL_UNPOOLED and `pnpm ingest`.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
