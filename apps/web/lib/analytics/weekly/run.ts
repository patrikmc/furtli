import type { Database } from "db";
import { exportToNotion, type NotionConfig } from "./notion";
import { lastCompletePeriod, periodForWeek, previousWeeks, type ReportPeriod } from "./period";
import { renderReport, renderReportTerminal, summarize, type ReportSummary } from "./report";
import type { TerminalOptions } from "./render-terminal";
import {
  SOURCES,
  buildSnapshot,
  defaultSources,
  loadSnapshots,
  mergeSnapshot,
  saveSnapshot,
  setNotionPage,
  type Snapshot,
  type Source,
} from "./snapshot";
import type { UmamiConfig } from "./umami-api";

/**
 * The Sunday job and its manual twins (`pnpm weekly-snapshot`, `pnpm weekly-report`):
 *   1. collect Umami + Neon for the week and upsert `weekly_metrics`
 *   2. (optional) render the report and export it to Notion
 * Shared by app/api/cron/weekly-snapshot and the scripts.
 */

export function resolvePeriod(week?: string | null, now: Date = new Date()): ReportPeriod {
  return week ? periodForWeek(week) : lastCompletePeriod(now);
}

/** "neon", "umami", "neon,umami" or "all" → sources; empty → the default for this configuration. */
export function parseSources(value: string | null | undefined, umami: UmamiConfig | null): Source[] {
  if (!value) return defaultSources(umami);
  if (value === "all") return [...SOURCES];
  const list = value.split(",").map((v) => v.trim());
  const bad = list.filter((v) => !(SOURCES as readonly string[]).includes(v));
  if (bad.length || !list.length) throw new Error(`Unknown source "${bad.join(",")}". Use neon, umami or all.`);
  return [...new Set(list)] as Source[];
}

export interface SnapshotRunResult {
  week: string;
  /** Sources collected in this run (others keep their stored values). */
  sources: Source[];
  firstDay: string;
  lastDay: string;
  saved: boolean;
  errors: Snapshot["errors"];
  summary: ReportSummary;
  notion?: { pageId: string; url: string | null } | { error: string };
}

export async function runWeeklySnapshot(opts: {
  db: Database;
  period: ReportPeriod;
  umami: UmamiConfig | null;
  notion?: NotionConfig | null;
  dryRun?: boolean;
  sources?: Source[];
}): Promise<SnapshotRunResult> {
  const sources = opts.sources ?? defaultSources(opts.umami);
  const fresh = await buildSnapshot(opts.period, { db: opts.db, umami: opts.umami }, sources);
  // Keep the parts this run didn't collect (e.g. Umami imported separately).
  // A dry run doesn't read the table, so it works before the migration too.
  const stored = opts.dryRun ? null : (await loadSnapshots(opts.db, [fresh.week])).get(fresh.week);
  const snapshot = mergeSnapshot(fresh, stored, sources);
  if (!opts.dryRun) await saveSnapshot(opts.db, snapshot);
  const result: SnapshotRunResult = {
    week: snapshot.week,
    sources,
    firstDay: opts.period.firstDay,
    lastDay: opts.period.lastDay,
    saved: !opts.dryRun,
    // Only this run's problems; gaps kept from earlier runs stay in the stored row.
    errors: fresh.errors,
    summary: summarize(snapshot),
  };
  if (opts.notion && !opts.dryRun) {
    try {
      result.notion = await exportReport(opts.db, snapshot.week, opts.notion);
    } catch (e) {
      result.notion = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return result;
}

/** A stored week rendered as Markdown, compared with up to four earlier stored weeks. */
export async function buildReport(
  db: Database,
  week: string,
): Promise<{ snapshot: Snapshot; history: Snapshot[]; markdown: string; summary: ReportSummary; terminal: (opts?: TerminalOptions) => string } | null> {
  const before = previousWeeks(week, 4);
  const stored = await loadSnapshots(db, [week, ...before]);
  const snapshot = stored.get(week);
  if (!snapshot) return null;
  const history = before.map((w) => stored.get(w)).filter((s): s is Snapshot => !!s);
  return {
    snapshot,
    history,
    markdown: renderReport(snapshot, history),
    summary: summarize(snapshot),
    terminal: (opts) => renderReportTerminal(snapshot, history, opts),
  };
}

/** Renders a stored week and creates (or replaces) its page in the Notion Reviews database. */
export async function exportReport(db: Database, week: string, notion: NotionConfig): Promise<{ pageId: string; url: string | null }> {
  const report = await buildReport(db, week);
  if (!report) throw new Error(`No snapshot stored for ${week}; run the snapshot first.`);
  const page = await exportToNotion(report.markdown, report.summary, notion, { replacePageId: report.snapshot.notionPageId });
  await setNotionPage(db, week, page.pageId);
  return page;
}
