import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });
import { closeDb, getDb, hasDatabase } from "db";
import { explain, parseArgs } from "@/lib/analytics/weekly/cli";
import { notionConfig } from "@/lib/analytics/weekly/notion";
import { buildReport, exportReport, resolvePeriod } from "@/lib/analytics/weekly/run";
import { latestSnapshot } from "@/lib/analytics/weekly/snapshot";

/**
 * Render a stored week (from weekly_metrics) without collecting anything.
 *
 *   pnpm weekly-report                         latest stored week, styled for the terminal
 *   pnpm weekly-report --week 2026-W40
 *   pnpm weekly-report --last-complete         the week that just ended (Sun–Sat, Zurich); fails if it
 *                                              hasn't been collected yet instead of showing an older week
 *   pnpm weekly-report --md                    styled Markdown instead
 *   pnpm weekly-report --out report.md         write Markdown to a file (--out report.txt: terminal text)
 *   pnpm weekly-report --out-dir ~/reports     save the week as Markdown, named by its week (2026-W40.md)
 *   pnpm weekly-report --json                  snapshot + history + summary + markdown
 *   pnpm weekly-report --no-color              terminal style without colour (also NO_COLOR=1, or when piped)
 *   pnpm weekly-report --notion                create the page in Notion Reviews (NOTION_TOKEN); an earlier
 *                                              export of the same week (same title) goes to Notion's trash;
 *                                              combine with --out-dir to save a copy in the same run
 *                                              (scripts/weekly-local.sh does this every Sunday morning)
 * Read-only on the database: runs with a login that can only SELECT weekly_metrics.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2), ["--notion", "--json", "--md", "--no-color", "--last-complete"], ["--week", "--out", "--out-dir"]);
  const opt = (name: string) => args.values.get(name);
  if (!hasDatabase()) throw new Error("DATABASE_URL is not set.");
  const db = getDb();
  if (opt("--week") && args.flags.has("--last-complete")) throw new Error("Use either --week or --last-complete.");
  const expected = args.flags.has("--last-complete") ? resolvePeriod(null).week : undefined;
  const week = opt("--week") ?? expected ?? (await latestSnapshot(db))?.week;
  if (!week) throw new Error("No weekly snapshot stored yet: the Sunday collection on Vercel hasn't run.");
  if (expected && !(await buildReport(db, expected))) {
    throw new Error(
      `${expected} hasn't been collected yet. The Sunday collection on Vercel (03:00 UTC) hasn't run or failed: ` +
        "check Vercel → Settings → Cron Jobs, run it there (or curl the cron URL), then run this again.",
    );
  }

  const outDir = opt("--out-dir");
  const notion = args.flags.has("--notion");
  if (outDir || notion) {
    // Archive and/or export (the Sunday job): no terminal output beyond one line each.
    if (notion && !notionConfig()) throw new Error("NOTION_TOKEN is not set.");
    if (outDir) {
      const report = await buildReport(db, week);
      if (!report) throw new Error(`No snapshot stored for ${week}.`);
      const dir = resolve(outDir);
      mkdirSync(dir, { recursive: true });
      const file = join(dir, `${week}.md`);
      writeFileSync(file, report.markdown);
      console.log(`Saved ${file}`);
    }
    if (notion) {
      const page = await exportReport(db, week, notionConfig()!);
      console.log(`Notion: ${page.url ?? page.pageId}${page.replaced ? ` (replaced ${page.replaced} earlier export${page.replaced > 1 ? "s" : ""})` : ""}`);
    }
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
