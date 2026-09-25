import { beforeEach } from "vitest";
import { db } from "../client";
import { quizzes } from "../schema";

/**
 * Runs before every integration test (wired in via vitest.config.ts's
 * `integration` project -> `test.setupFiles`). Deleting `quizzes` cascades
 * to `questions`, `choices`, `attempts`, and `answers` (see schema.ts's
 * `onDelete: "cascade"` chain), so one statement gives every test a
 * completely empty, known-good starting state — no leftover rows from a
 * previous test can make a later test pass (or fail) for the wrong reason.
 *
 * This is the "reset between tests" strategy, not "wrap each test in a
 * transaction and roll it back." The transaction-rollback technique is
 * faster (no real commit/cascade per test) but requires every function
 * under test to accept an injected `tx` client instead of importing the
 * module-level `db` singleton directly — a bigger refactor than this
 * template's `sync.ts`/`quizzes.ts` currently do. `DELETE ... CASCADE` on
 * a handful of small tables is well under a millisecond, so for a test
 * suite this size the simpler strategy costs nothing you'd notice.
 */
beforeEach(async () => {
  await db.delete(quizzes);
});
