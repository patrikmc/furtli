import { writeFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
import { closeDb, getDb, hasDatabase } from "db";
import { explain, parseArgs } from "@/lib/analytics/weekly/cli";
import { notionConfig } from "@/lib/analytics/weekly/notion";
import { buildReport, exportReport } from "@/lib/analytics/weekly/run";
import { latestSnapshot } from "@/lib/analytics/weekly/snapshot";

/**
 * Render a stored week (from weekly_metrics) without collecting anything.
 *
 *   pnpm weekly-report                         latest stored week, styled for the terminal
 *   pnpm weekly-report --week 2026-W40
 *   pnpm weekly-report --md                    styled Markdown instead
 *   pnpm weekly-report --out report.md         write Markdown to a file (--out report.txt: terminal text)
 *   pnpm weekly-report --json                  snapshot + history + summary + markdown
 *   pnpm weekly-report --no-color              terminal style without colour (also NO_COLOR=1, or when piped)
 *   pnpm weekly-report --notion                create the page in Notion Reviews (NOTION_TOKEN); an earlier
 *                                              export of the same week (same title) goes to Notion's trash
 * Read-only on the database: runs with a login that can only SELECT weekly_metrics.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2), ["--notion", "--json", "--md", "--no-color"], ["--week", "--out"]);
  const opt = (name: string) => args.values.get(name);
  if (!hasDatabase()) throw new Error("DATABASE_URL is not set.");
  const db = getDb();
  const week = opt("--week") ?? (await latestSnapshot(db))?.week;
  if (!week) throw new Error("No weekly snapshot stored yet: run `pnpm weekly-snapshot` first.");

  if (args.flags.has("--notion")) {
    const cfg = notionConfig();
    if (!cfg) throw new Error("NOTION_TOKEN is not set.");
    const page = await exportReport(db, week, cfg);
    console.log(`Notion: ${page.url ?? page.pageId}${page.replaced ? ` (replaced ${page.replaced} earlier export${page.replaced > 1 ? "s" : ""})` : ""}`);
    return;
  }
  const report = await buildReport(db, week);
  if (!report) throw new Error(`No snapshot stored for ${week}.`);
  const out = opt("--out");
  const color = !out && !args.flags.has("--no-color") && !process.env.NO_COLOR && process.stdout.isTTY === true;
  const width = process.stdout.columns ? Math.min(process.stdout.columns, 110) : 100;
  const { terminal, ...data } = report;
  const text = args.flags.has("--json")
    ? JSON.stringify(data, null, 2)
    : args.flags.has("--md") || out?.endsWith(".md")
      ? report.markdown
      : terminal({ color, width });
  if (out) {
    writeFileSync(out, text);
    console.log(`Wrote ${out}`);
  } else console.log(text);
}

main()
  .catch((e) => {
    console.error(explain(e));
    process.exitCode = 1;
  })
  .finally(() => closeDb());
