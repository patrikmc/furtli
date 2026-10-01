import { and, emailLog, eq, gte, ingestRun, lt, sql, subscriber, subscription, type Database } from "db";
import { type AttributionReport, type AttributionRow, summarizeAttribution } from "../attribution-report";
import type { ReportPeriod } from "./period";
import type { SnapshotError } from "./umami-api";

/**
 * Weekly aggregates from our own database. Loaders select only what the
 * numbers need (no email addresses); the summaries are pure and tested.
 * Counts that depend on time (active, churn) are computed from timestamps,
 * so re-running an older week gives that week's numbers.
 */

export interface SubscriberRow extends AttributionRow {
  lang: string;
  digest: boolean;
}

export interface SubscriptionRow {
  plz: string | null;
  stationId: string | null;
  topics: string[];
  subscriberStatus: "pending" | "active" | "unsubscribed";
}

export interface EmailCount {
  kind: string;
  status: string;
  count: number;
}

export interface IngestRow {
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface Count {
  key: string;
  count: number;
}

export interface NeonWeek {
  /** When this part of the snapshot was collected (ISO). */
  collectedAt?: string;
  subscribers: {
    /** Signed up in the period (any status now). */
    signedUp: number;
    /** Of those, clicked the confirmation link. */
    signedUpAndConfirmed: number;
    /** Confirmations in the period, whenever they signed up: the north-star count. */
    newConfirmed: number;
    unsubscribed: number;
    /** newConfirmed − unsubscribed */
    net: number;
    activeAtStart: number;
    activeAtEnd: number;
    /** unsubscribed ÷ activeAtStart, in % (null without a base). */
    churnPct: number | null;
    /** Median hours from sign-up to confirmation, for confirmations in the period. */
    medianHoursToConfirm: number | null;
    /** Pending for more than 48 h at the end of the period. */
    unconfirmed48h: number;
    /** Share of active subscribers (end) with the weekly overview, in %. */
    digestPct: number | null;
    byLang: Count[];
  };
  attribution: Pick<AttributionReport, "byChannelGroup" | "byChannel" | "byPost">;
  /** Current state (subscriptions keep no history): active subscriptions. */
  subscriptions: { active: number; byTopic: Count[]; byPlz: Count[]; byStation: Count[] };
  emails: EmailCount[];
  ingest: { runs: number; failed: number; lastStatus: string | null; lastFinishedAt: string | null };
}

const activeAt = (r: SubscriberRow, t: Date) =>
  r.confirmedAt !== null && r.confirmedAt < t && (r.unsubscribedAt === null || r.unsubscribedAt >= t);
const inPeriod = (d: Date | null, p: ReportPeriod) => d !== null && d >= p.start && d < p.end;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function counts(keys: string[], limit = Infinity): Count[] {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export function summarizeNeon(
  data: { subscribers: SubscriberRow[]; subscriptions: SubscriptionRow[]; emails: EmailCount[]; ingests: IngestRow[]; lastIngest: IngestRow | null },
  p: ReportPeriod,
): NeonWeek {
  const subs = data.subscribers;
  const signed = subs.filter((r) => inPeriod(r.createdAt, p));
  const confirmed = subs.filter((r) => inPeriod(r.confirmedAt, p));
  const unsubscribed = subs.filter((r) => inPeriod(r.unsubscribedAt, p)).length;
  const activeAtStart = subs.filter((r) => activeAt(r, p.start)).length;
  const activeEnd = subs.filter((r) => activeAt(r, p.end));
  const stale = new Date(p.end.getTime() - 48 * 3_600_000);
  const attribution = summarizeAttribution(subs, new Date(p.end.getTime() - 1), 7);
  const active = data.subscriptions.filter((s) => s.subscriberStatus === "active" && s.topics.length > 0);

  return {
    subscribers: {
      signedUp: signed.length,
      signedUpAndConfirmed: signed.filter((r) => r.confirmedAt !== null).length,
      newConfirmed: confirmed.length,
      unsubscribed,
      net: confirmed.length - unsubscribed,
      activeAtStart,
      activeAtEnd: activeEnd.length,
      churnPct: pct(unsubscribed, activeAtStart),
      medianHoursToConfirm: (() => {
        const m = median(confirmed.map((r) => (r.confirmedAt!.getTime() - r.createdAt.getTime()) / 3_600_000));
        return m === null ? null : Math.round(m * 10) / 10;
      })(),
      unconfirmed48h: subs.filter((r) => r.createdAt < stale && (r.confirmedAt === null || r.confirmedAt >= p.end) && r.status !== "unsubscribed").length,
      digestPct: pct(activeEnd.filter((r) => r.digest).length, activeEnd.length),
      byLang: counts(activeEnd.map((r) => r.lang)),
    },
    attribution: {
      byChannelGroup: attribution.byChannelGroup,
      byChannel: attribution.byChannel,
      byPost: attribution.byPost,
    },
    subscriptions: {
      active: active.length,
      byTopic: counts(active.flatMap((s) => s.topics)),
      byPlz: counts(active.flatMap((s) => (s.plz ? [s.plz] : [])), 15),
      byStation: counts(active.flatMap((s) => (s.stationId ? [s.stationId] : [])), 10),
    },
    emails: [...data.emails].sort((a, b) => a.kind.localeCompare(b.kind) || a.status.localeCompare(b.status)),
    ingest: {
      runs: data.ingests.length,
      failed: data.ingests.filter((r) => r.status === "failed").length,
      lastStatus: data.lastIngest?.status ?? null,
      lastFinishedAt: data.lastIngest?.finishedAt?.toISOString() ?? null,
    },
  };
}

/**
 * Subscribers are required (without them there is no Neon part); the other
 * queries are independent, so one failing (e.g. email_log) is recorded in
 * `errors` and the rest still lands.
 */
export async function collectNeon(db: Database, p: ReportPeriod, errors: SnapshotError[] = []): Promise<NeonWeek> {
  async function part<T>(call: string, fallback: T, q: () => Promise<T>): Promise<T> {
    try {
      return await q();
    } catch (e) {
      errors.push({ source: "neon", call, message: e instanceof Error ? e.message : String(e) });
      return fallback;
    }
  }
  const subscribers = await db
    .select({
      status: subscriber.status,
      createdAt: subscriber.createdAt,
      confirmedAt: subscriber.confirmedAt,
      unsubscribedAt: subscriber.unsubscribedAt,
      utmSource: subscriber.utmSource,
      utmMedium: subscriber.utmMedium,
      utmCampaign: subscriber.utmCampaign,
      utmContent: subscriber.utmContent,
      referrer: subscriber.referrer,
      lang: subscriber.lang,
      digest: subscriber.digest,
    })
    .from(subscriber);
  const subscriptions = await part("subscriptions", [] as SubscriptionRow[], async () =>
    (
      await db
        .select({
          plz: subscription.plz,
          stationId: subscription.stationId,
          topics: subscription.topics,
          subscriberStatus: subscriber.status,
        })
        .from(subscription)
        .innerJoin(subscriber, eq(subscription.subscriberId, subscriber.id))
    ).map((s) => ({ ...s, topics: s.topics as string[] })),
  );
  const emails = await part("emails", [] as EmailCount[], () =>
    db
      .select({ kind: emailLog.kind, status: emailLog.status, count: sql<number>`count(*)::int` })
      .from(emailLog)
      .where(and(gte(emailLog.createdAt, p.start), lt(emailLog.createdAt, p.end)))
      .groupBy(emailLog.kind, emailLog.status),
  );
  const ingestCols = { status: ingestRun.status, startedAt: ingestRun.startedAt, finishedAt: ingestRun.finishedAt };
  const ingests = await part("ingest", [] as IngestRow[], () =>
    db.select(ingestCols).from(ingestRun).where(and(gte(ingestRun.startedAt, p.start), lt(ingestRun.startedAt, p.end))),
  );
  const lastIngest = await part("ingest:last", null as IngestRow | null, async () => {
    const [r] = await db.select(ingestCols).from(ingestRun).where(lt(ingestRun.startedAt, p.end)).orderBy(sql`${ingestRun.startedAt} desc`).limit(1);
    return r ?? null;
  });
  return { collectedAt: new Date().toISOString(), ...summarizeNeon({ subscribers, subscriptions, emails, ingests, lastIngest }, p) };
}
