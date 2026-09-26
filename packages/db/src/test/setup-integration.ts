import { beforeEach } from "vitest";
import postgres from "postgres";
import { TEST_DATABASE_URL } from "./test-db";

/**
 * Runs before every integration test (wired in via the `integration`
 * vitest project of each package that has integration tests). Empties all
 * tables so each test starts from a known state.
 */
beforeEach(async () => {
  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql`TRUNCATE collection_event, station, source_file, ingest_run RESTART IDENTITY CASCADE`;
  } finally {
    await sql.end();
  }
});
