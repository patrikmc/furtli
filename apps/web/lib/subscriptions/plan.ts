import type { EmailItem } from "@/lib/email/types";
import { STATION_TOPICS, type Topic } from "./input";

/**
 * Pure planning: which subscriber gets which dates. No database, no clock;
 * the cron route (lib/subscriptions/scheduled.ts) feeds it rows and a date.
 */

/** One confirmed subscription row: a postcode or a station, with its types. */
export interface PlanTarget {
  plz: string | null;
  stationId: string | null;
  topics: Topic[];
}

/** A subscriber with everything they follow. */
export interface PlanSubscriber {
  id: number;
  targets: PlanTarget[];
}

/** A collection_event row joined with its station (if any). */
export interface PlanEvent extends EmailItem {
  plz: string;
}

/**
 * Does this event concern this subscription target?
 * - Kerbside types (paper, cardboard, organic, waste): by postcode.
 * - MRH / hazmat: the chosen station if there is one, otherwise every stop
 *   the city assigns to the subscriber's postcode.
 */
export function matchesTarget(sub: PlanTarget, e: PlanEvent): boolean {
  if (!sub.topics.includes(e.type)) return false;
  if (STATION_TOPICS.includes(e.type)) {
    if (sub.stationId) return e.stationId === sub.stationId;
    return sub.plz !== null && e.plz === sub.plz;
  }
  return sub.plz !== null && e.plz === sub.plz;
}

/** Does this event concern any of the subscriber's targets? */
export function matches(sub: PlanSubscriber, e: PlanEvent): boolean {
  return sub.targets.some((t) => matchesTarget(t, e));
}

const ORDER: Record<string, number> = { waste: 0, paper: 1, cardboard: 2, organic: 3, mrh: 4, hazmat: 5 };

/**
 * The subscriber's items across all targets, one per (type, date, station),
 * sorted by date then type. A date followed twice (e.g. via 8004 and via the
 * Stauffacher stop) is listed once.
 */
export function itemsFor(sub: PlanSubscriber, events: PlanEvent[]): EmailItem[] {
  const seen = new Set<string>();
  const out: EmailItem[] = [];
  for (const e of events) {
    if (!matches(sub, e)) continue;
    const key = `${e.type}|${e.date}|${e.stationId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: e.type,
      date: e.date,
      stationId: e.stationId ?? null,
      stationName: e.stationName ?? null,
      address: e.address ?? null,
      time: e.time ?? null,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.type] - ORDER[b.type]);
}

/** Evening-before reminders: subscribers with at least one item on `date`. */
export function planReminders<S extends PlanSubscriber>(subs: S[], events: PlanEvent[], date: string) {
  const onDay = events.filter((e) => e.date === date);
  return subs.map((sub) => ({ sub, items: itemsFor(sub, onDay) })).filter((r) => r.items.length > 0);
}

/** Weekly digest: items from `from` to `to` (inclusive), grouped by day. Empty weeks are skipped. */
export function planDigests<S extends PlanSubscriber>(subs: S[], events: PlanEvent[], from: string, to: string) {
  const inRange = events.filter((e) => e.date >= from && e.date <= to);
  return subs
    .map((sub) => {
      const byDay = new Map<string, EmailItem[]>();
      for (const it of itemsFor(sub, inRange)) byDay.set(it.date, [...(byDay.get(it.date) ?? []), it]);
      return { sub, days: [...byDay.entries()].map(([date, items]) => ({ date, items })) };
    })
    .filter((r) => r.days.length > 0);
}

/** YYYY-MM-DD plus n days (calendar arithmetic, no time zones involved). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD date. */
export function weekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}
