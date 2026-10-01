import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
import { closeDb, getDb, hasDatabase } from "db";
import { explain, parseArgs } from "@/lib/analytics/weekly/cli";
import { notionConfig } from "@/lib/analytics/weekly/notion";
import { parseSources, resolvePeriod, runWeeklySnapshot } from "@/lib/analytics/weekly/run";
import { umamiConfig } from "@/lib/analytics/weekly/umami-api";

/**
 * Collect a week into weekly_metrics: the same job the Sunday cron runs.
 *
 *   pnpm weekly-snapshot                    last complete week (Sun–Sat, Zurich)
 *   pnpm weekly-snapshot --week 2026-W40    a given week (overwrites its row; backfill)
 *   pnpm weekly-snapshot --dry-run          collect and print, save nothing
 *   pnpm weekly-snapshot --source neon      only the database (default without UMAMI_API_KEY);
 *                                           other parts of a stored week are kept
 *   pnpm weekly-snapshot --notion           also export the report to Notion (needs NOTION_TOKEN)
 *   DATABASE_URL=<neon url> UMAMI_API_KEY=… pnpm weekly-snapshot
 */
async function main() {
  const args = parseArgs(process.argv.slice(2), ["--dry-run", "--notion", "--json"], ["--week", "--source"]);
  const period = resolvePeriod(args.values.get("--week"));
  if (!hasDatabase()) throw new Error("DATABASE_URL is not set.");
  const notion = args.flags.has("--notion") ? notionConfig() : null;
  if (args.flags.has("--notion") && !notion) throw new Error("NOTION_TOKEN is not set.");
  const umami = umamiConfig();
  const sources = parseSources(args.values.get("--source"), umami);
  const dryRun = args.flags.has("--dry-run");
  console.error(
    `${dryRun ? "Dry run" : "Snapshot"} for ${period.week} (${period.firstDay} to ${period.lastDay}) · collecting ${sources.join(" + ")}${umami ? "" : " (no UMAMI_API_KEY: Umami skipped)"}`,
  );
  const result = await runWeeklySnapshot({ db: getDb(), period, umami, notion, dryRun, sources });
  if (args.flags.has("--json")) return console.log(JSON.stringify(result, null, 2));
  const s = result.summary;
  console.log(`${result.week} (${result.firstDay} to ${result.lastDay}) ${result.saved ? "saved" : "dry run, not saved"}`);
  console.log(`  visitors ${s.visitors ?? "–"} · used the map ${s.activatedVisitors ?? "–"} · sign-ups ${s.signUps ?? "–"} · new confirmed ${s.newConfirmed ?? "–"} · active subscribers ${s.activeSubscribers ?? "–"}`);
  for (const e of result.errors) console.log(`  gap: ${e.source}${e.call ? ` (${e.call})` : ""}: ${e.message}`);
  if (result.notion) console.log("error" in result.notion ? `  Notion failed: ${result.notion.error}` : `  Notion: ${result.notion.url ?? result.notion.pageId}`);
}

main()
  .catch((e) => {
    console.error(explain(e));
    process.exitCode = 1;
  })
  .finally(() => closeDb());
