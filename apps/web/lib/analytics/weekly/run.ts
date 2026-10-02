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
  type Snapshot,
  type Source,
} from "./snapshot";
import type { UmamiConfig } from "./umami-api";

/**
 * Two separate jobs, run in two places:
 *   collect (Vercel, Sunday cron; `pnpm weekly-snapshot` for local dev):
 *     Umami + Neon for the week → upsert `weekly_metrics`. Never touches Notion.
 *   report (the Mac, `pnpm weekly-report`): reads `weekly_metrics` only,
 *     renders it and optionally exports it to Notion. Never writes to the database.
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
}

export async function runWeeklySnapshot(opts: {
  db: Database;
  period: ReportPeriod;
  umami: UmamiConfig | null;
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

/**
 * Renders a stored week and creates its page in the Notion Reviews database,
 * replacing an earlier export of that week (found by title). Read-only on
 * our side: works with a database login that can only SELECT weekly_metrics.
 */
export async function exportReport(
  db: Database,
  week: string,
  notion: NotionConfig,
): Promise<{ pageId: string; url: string | null; replaced: number }> {
  const report = await buildReport(db, week);
  if (!report) throw new Error(`No snapshot stored for ${week}; the Sunday collection hasn't run for it yet.`);
  return exportToNotion(report.markdown, report.summary, notion);
}
