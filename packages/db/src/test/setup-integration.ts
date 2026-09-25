import { beforeEach } from "vitest";

/**
 * Runs before every integration test (wired in via vitest.config.ts's
 * `integration` project). Reset tables here once step 2 adds a schema,
 * e.g. `await db.delete(stations)` with cascading deletes.
 */
beforeEach(async () => {});
