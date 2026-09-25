import { resolve } from "node:path";
import "dotenv/config";
import { client } from "./client";
import { loadQuizContentDir } from "./content";
import { upsertQuizContent } from "./sync";

/**
 * Populate (or update) the database from the YAML content directory.
 *
 * This is the "future setups of a new database contain those added
 * changes as well" requirement: run this against a brand-new empty
 * database and it builds the entire catalogue from scratch; run it again
 * after editing a YAML file and it updates exactly the rows that changed,
 * leaving everything else — crucially, all `attempts`/`answers` user
 * history — untouched. See docs/QUIZZES.md for the full workflow,
 * including how this interacts with admin edits made from the web UI.
 *
 * Safe to run repeatedly (idempotent): re-running with no content changes
 * makes zero writes beyond `updatedAt` timestamps.
 */

const CONTENT_DIR = process.env.CONTENT_DIR ?? resolve(import.meta.dirname, "../../../content/quizzes");

async function main() {
  console.log(`Loading quiz content from ${CONTENT_DIR}`);
  const quizContents = loadQuizContentDir(CONTENT_DIR);
  console.log(`Found ${quizContents.length} quiz file(s): ${quizContents.map((q) => q.slug).join(", ")}`);

  for (const quiz of quizContents) {
    const { questionCount, choiceCount } = await upsertQuizContent(quiz);
    console.log(`  ✓ ${quiz.slug} — ${questionCount} question(s), ${choiceCount} choice(s)`);
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
