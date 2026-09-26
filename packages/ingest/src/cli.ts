import { config } from "dotenv";

// Same env files as the db package: packages/ingest/.env, else packages/db/.env.
config({ path: [".env", "../db/.env"], quiet: true });

import { closeDb, getDb } from "db";
import { HttpFetcher } from "./fetcher";
import { IngestError } from "./parse/common";
import { runIngest } from "./run";

/**
 * pnpm ingest            fetch, validate and load everything
 * pnpm ingest --dry-run  same, but roll back and only print what would change
 *
 * Reads DATABASE_URL (or DATABASE_URL_UNPOOLED, preferred for scripts) from
 * the environment / packages/ingest/.env.
 */
async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
  const started = Date.now();
  const summary = await runIngest({
    db: getDb(),
    fetcher: new HttpFetcher(),
    trigger: "manual",
    dryRun,
    log: (m) => console.log(`  ${m}`),
  });

  console.log(`\n${dryRun ? "DRY RUN (nothing written)" : `Run #${summary.runId}`} — ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(`Years: ${summary.years.join(", ")}`);
  console.table(summary.stations);
  console.table(
    summary.datasets.map((d) => ({
      dataset: d.dataset.replace("entsorgungskalender_", ""),
      year: d.year,
      rows: d.rows,
      "new file": d.newFile ? "yes" : "",
      added: d.added,
      removed: d.removed,
    })),
  );
  console.log("Station matches:", summary.matches);
  for (const w of summary.warnings) console.warn(`WARNING: ${w}`);
  console.log(summary.changed ? "Data changed." : "No changes.");
}

main()
  .catch((e) => {
    console.error(`\nINGEST FAILED: ${e instanceof Error ? e.message : e}`);
    if (e instanceof IngestError && e.details) console.error(JSON.stringify(e.details, null, 2));
    process.exitCode = 1;
  })
  .finally(() => closeDb());
