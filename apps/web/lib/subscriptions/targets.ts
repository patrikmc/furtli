import { asc, eq, inArray, station, subscription, type Database, type Subscriber } from "db";
import { asLang, type Lang } from "@/lib/email/copy";
import type { SubscriptionSummary, SummaryTarget } from "@/lib/email/types";
import type { Topic } from "./topics";
import type { PlanTarget } from "./plan";

/**
 * Reading what subscribers follow (the `subscription` rows) and turning it
 * into the shapes the planner and the emails need. No "server-only" import,
 * so the admin CLI can use it too.
 */

/** A subscription row joined with its station's name and kind. */
export interface TargetRow {
  id: number;
  subscriberId: number;
  plz: string | null;
  stationId: string | null;
  stationName: string | null;
  stationKind: string | null;
  topics: Topic[];
  pendingTopics: Topic[] | null;
  source: string | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Account-wide settings (one per email address). */
export interface Settings {
  lang: Lang;
  reminders: boolean;
  digest: boolean;
}

export function settingsOf(s: Pick<Subscriber, "lang" | "reminders" | "digest">): Settings {
  return { lang: asLang(s.lang), reminders: s.reminders, digest: s.digest };
}

/** Pending settings of an active subscriber (pending_prefs), if any. */
export function pendingSettingsOf(s: Subscriber): Settings | null {
  const p = s.pendingPrefs as Partial<Settings> | null;
  if (!p) return null;
  return { lang: asLang(p.lang), reminders: p.reminders ?? s.reminders, digest: p.digest ?? s.digest };
}

/** All subscription rows of these subscribers, oldest first. */
export async function loadTargets(db: Database, subscriberIds: number[]): Promise<TargetRow[]> {
  if (subscriberIds.length === 0) return [];
  const rows = await db
    .select({
      id: subscription.id,
      subscriberId: subscription.subscriberId,
      plz: subscription.plz,
      stationId: subscription.stationId,
      stationName: station.name,
      stationKind: station.kind,
      topics: subscription.topics,
      pendingTopics: subscription.pendingTopics,
      source: subscription.source,
      confirmedAt: subscription.confirmedAt,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    })
    .from(subscription)
    .leftJoin(station, eq(subscription.stationId, station.id))
    .where(inArray(subscription.subscriberId, subscriberIds))
    .orderBy(asc(subscription.createdAt), asc(subscription.id));
  return rows.map((r) => ({ ...r, topics: r.topics as Topic[], pendingTopics: (r.pendingTopics as Topic[] | null) ?? null }));
}

/** Rows grouped by subscriber id. */
export function bySubscriber(rows: TargetRow[]): Map<number, TargetRow[]> {
  const m = new Map<number, TargetRow[]>();
  for (const r of rows) m.set(r.subscriberId, [...(m.get(r.subscriberId) ?? []), r]);
  return m;
}

/** Confirmed targets only (what reminders and digests are planned from). */
export function activeTargets(rows: TargetRow[]): PlanTarget[] {
  return rows.filter((r) => r.topics.length > 0).map((r) => ({ plz: r.plz, stationId: r.stationId, topics: r.topics }));
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * The whole subscription for an email.
 * - "active": what is confirmed now (reminders, digests, welcome).
 * - "preview": what it will be after the pending confirmation, with new and
 *   changed targets marked (confirm email and page).
 */
export function summaryOf(rows: TargetRow[], settings: Settings, mode: "active" | "preview" = "active"): SubscriptionSummary {
  const targets: SummaryTarget[] = [];
  for (const r of rows) {
    const pending = mode === "preview" ? r.pendingTopics : null;
    const topics = pending ?? r.topics;
    if (topics.length === 0) continue;
    const change = !pending ? null : r.topics.length === 0 ? "new" : sameSet(pending, r.topics) ? null : "changed";
    targets.push({ plz: r.plz, stationName: r.stationName, topics, ...(mode === "preview" ? { change } : {}) });
  }
  return { targets, reminders: settings.reminders, digest: settings.digest };
}

/** Where "open the map" in an email points: the first thing they follow. */
export function primaryTarget(rows: TargetRow[]): { plz: string | null; stationId: string | null } {
  const r = rows.find((x) => x.topics.length > 0) ?? rows.find((x) => x.pendingTopics?.length) ?? rows[0];
  return { plz: r?.plz ?? null, stationId: r?.stationId ?? null };
}
