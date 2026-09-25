import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import "dotenv/config";
import { db, client } from "./client";
import { renderQuizAsYaml } from "./sync";

/**
 * The reverse of seed.ts: read the current catalogue out of the database
 * and write it back to `content/quizzes/*.yaml`.
 *
 * Why this exists: the admin UI (apps/web/app/admin) lets an admin fix a
 * wrong answer or edit quiz copy directly against the live database, for
 * speed — but a running web app has no way to commit to git on its own.
 * Without this script, a live edit would fix production immediately but
 * silently vanish the next time someone reseeds a fresh database (a new
 * test environment, a new developer's laptop, a disaster-recovery
 * restore) from the *stale* YAML files. Run this after any admin-UI edit,
 * review the resulting `git diff`, and commit it — that commit is what
 * makes the change permanent, per the "future setups of a new database
 * contain those added changes as well" requirement. See docs/QUIZZES.md.
 *
 * This script only ever writes files for quizzes that currently exist in
 * the database — it does not delete a YAML file for a quiz that was
 * deleted from the database (that's a deliberate guard-rail against a
 * script silently deleting content files; remove the file yourself and
 * commit that too, if a quiz was genuinely retired).
 */

const CONTENT_DIR = process.env.CONTENT_DIR ?? resolve(import.meta.dirname, "../../../content/quizzes");

async function main() {
  const quizRows = await db.query.quizzes.findMany({
    orderBy: (quizzes, { asc }) => [asc(quizzes.slug)],
    with: {
      questions: {
        orderBy: (questions, { asc }) => [asc(questions.sortOrder)],
        with: {
          choices: {
            orderBy: (choices, { asc }) => [asc(choices.sortOrder)],
          },
        },
      },
    },
  });

  console.log(`Exporting ${quizRows.length} quiz(zes) to ${CONTENT_DIR}`);

  for (const quiz of quizRows) {
    const { yamlText: rendered, syntheticKeyCount } = renderQuizAsYaml(quiz);
    const yamlText = `# Exported from the live database by \`pnpm db:export\`. Review this diff\n# and commit it — see docs/QUIZZES.md for why that step matters.\n${rendered}`;

    const filePath = resolve(CONTENT_DIR, `${quiz.slug}.yaml`);
    writeFileSync(filePath, yamlText, "utf-8");

    const warning =
      syntheticKeyCount > 0
        ? ` (${syntheticKeyCount} row(s) had no stable key — one was synthesized from position; re-run db:seed to persist it)`
        : "";
    console.log(`  ✓ ${quiz.slug} -> ${filePath}${warning}`);
  }

  console.log("Export complete. Run `git diff content/quizzes/` to review, then commit.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
