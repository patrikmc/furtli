import { desc, eq, inArray, weeklyMetrics, type Database } from "db";
import { collectNeon, type NeonWeek } from "./neon";
import type { ReportPeriod } from "./period";
import { collectUmami, type SnapshotError, type UmamiConfig, type UmamiWeek } from "./umami-api";

/**
 * One week of numbers, as stored in `weekly_metrics` and rendered by
 * report.ts. Bump SNAPSHOT_VERSION when the JSON shape changes.
 */
export const SNAPSHOT_VERSION = 1;

export interface Derived {
  /** Visitors with a first_action ÷ visitors, in %. */
  activationPct: number | null;
  /** place_search with results ≠ "0" ÷ all place_search, in %. */
  searchSuccessPct: number | null;
  /** Visitor → step rates, in % of visitors. */
  funnel: { step: string; visitors: number; pctOfVisitors: number | null }[];
  /** Sign-ups in the period that confirmed, in %. */
  confirmPct: number | null;
}

export interface Snapshot {
  week: string;
  startsAt: string;
  endsAt: string;
  version: number;
  umami: UmamiWeek | null;
  neon: NeonWeek | null;
  derived: Derived;
  errors: SnapshotError[];
  generatedAt: string;
  notionPageId?: string | null;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export function derive(umami: UmamiWeek | null, neon: NeonWeek | null): Derived {
  const visitors = umami?.stats.visitors ?? 0;
  const w = umami?.visitorsWith ?? {};
  const results = umami?.props["place_search.results"] ?? [];
  const searches = results.reduce((s, i) => s + i.total, 0);
  const empty = results.find((i) => i.value === "0")?.total ?? 0;
  const funnel = umami
    ? [
        { step: "Visitors", visitors },
        { step: "Used the map (first_action)", visitors: w.first_action ?? 0 },
        { step: "Opened a station", visitors: w.station_open ?? 0 },
        { step: "Opened the reminder form", visitors: w.subscribe_open ?? 0 },
        { step: "Sent the form", visitors: w.subscribe_submit ?? 0 },
      ].map((s) => ({ ...s, pctOfVisitors: pct(s.visitors, visitors) }))
    : [];
  return {
    activationPct: umami ? pct(w.first_action ?? 0, visitors) : null,
    searchSuccessPct: searches ? pct(searches - empty, searches) : null,
    funnel,
    confirmPct: neon ? pct(neon.subscribers.signedUpAndConfirmed, neon.subscribers.signedUp) : null,
  };
}

/** The two independent parts of a snapshot. Each is collected and saved on its own. */
export type Source = "neon" | "umami";
export const SOURCES: readonly Source[] = ["neon", "umami"];

export interface BuildDeps {
  db: Database | null;
  umami: UmamiConfig | null;
  fetchImpl?: typeof fetch;
  now?: Date;
}

/** What a run collects when nothing is asked for: Neon always, Umami only when its API is configured. */
export function defaultSources(umami: UmamiConfig | null): Source[] {
  return umami ? ["neon", "umami"] : ["neon"];
}

/**
 * Collects the requested sources for a period. Never throws for a source
 * failure: it lands in `errors`. Sources not requested stay null here and
 * keep their stored value on save (see mergeSnapshot).
 */
export async function buildSnapshot(period: ReportPeriod, deps: BuildDeps, sources: readonly Source[] = defaultSources(deps.umami)): Promise<Snapshot> {
  const errors: SnapshotError[] = [];
  let umami: UmamiWeek | null = null;
  if (sources.includes("umami")) {
    if (deps.umami) umami = await collectUmami(period, deps.umami, errors, deps.fetchImpl);
    else errors.push({ source: "umami", message: "Umami requested, but UMAMI_API_KEY or the website id is not set." });
  }

  let neon: NeonWeek | null = null;
  if (sources.includes("neon")) {
    if (deps.db) {
      try {
        neon = await collectNeon(deps.db, period, errors);
      } catch (e) {
        errors.push({ source: "neon", message: e instanceof Error ? e.message : String(e) });
      }
    } else errors.push({ source: "neon", message: "DATABASE_URL not set: no subscriber data." });
  }

  return {
    week: period.week,
    startsAt: period.start.toISOString(),
    endsAt: period.end.toISOString(),
    version: SNAPSHOT_VERSION,
    umami,
    neon,
    derived: derive(umami, neon),
    errors,
    generatedAt: (deps.now ?? new Date()).toISOString(),
  };
}

/**
 * Combines a fresh partial snapshot with the stored row of the same week:
 * collected sources replace their part (and their errors); the others, and
 * their errors, are kept. Derived rates are recomputed from the result.
 */
export function mergeSnapshot(fresh: Snapshot, stored: Snapshot | null | undefined, sources: readonly Source[]): Snapshot {
  if (!stored) return fresh;
  const umami = sources.includes("umami") ? fresh.umami : stored.umami;
  const neon = sources.includes("neon") ? fresh.neon : stored.neon;
  return {
    ...fresh,
    umami,
    neon,
    derived: derive(umami, neon),
    errors: [...stored.errors.filter((e) => !sources.includes(e.source as Source)), ...fresh.errors],
    notionPageId: stored.notionPageId,
  };
}

/** Insert or replace the week's row (callers merge first, see mergeSnapshot; the Notion page id is kept). */
export async function saveSnapshot(db: Database, s: Snapshot): Promise<void> {
  const data = {
    startsAt: new Date(s.startsAt),
    endsAt: new Date(s.endsAt),
    version: s.version,
    umami: s.umami,
    neon: s.neon,
    derived: s.derived,
    errors: s.errors,
    generatedAt: new Date(s.generatedAt),
  };
  await db
    .insert(weeklyMetrics)
    .values({ week: s.week, ...data })
    .onConflictDoUpdate({ target: weeklyMetrics.week, set: data });
}

function fromRow(r: typeof weeklyMetrics.$inferSelect): Snapshot {
  return {
    week: r.week,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    version: r.version,
    umami: r.umami as UmamiWeek | null,
    neon: r.neon as NeonWeek | null,
    derived: r.derived as Derived,
    errors: (r.errors as SnapshotError[]) ?? [],
    generatedAt: r.generatedAt.toISOString(),
    notionPageId: r.notionPageId,
  };
}

/** Stored snapshots for these weeks (missing weeks are left out). */
export async function loadSnapshots(db: Database, weeks: string[]): Promise<Map<string, Snapshot>> {
  if (!weeks.length) return new Map();
  const rows = await db.select().from(weeklyMetrics).where(inArray(weeklyMetrics.week, weeks));
  return new Map(rows.map((r) => [r.week, fromRow(r)]));
}

/** The most recent stored week, if any. */
export async function latestSnapshot(db: Database): Promise<Snapshot | null> {
  const [r] = await db.select().from(weeklyMetrics).orderBy(desc(weeklyMetrics.endsAt)).limit(1);
  return r ? fromRow(r) : null;
}

export async function setNotionPage(db: Database, week: string, pageId: string): Promise<void> {
  await db.update(weeklyMetrics).set({ notionPageId: pageId }).where(eq(weeklyMetrics.week, week));
}
