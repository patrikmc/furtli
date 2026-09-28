import { subscriber, type Database } from "db";
import { channelOf, type Channel } from "./attribution";

/**
 * Weekly attribution: which channels and posts brought sign-ups and confirmed
 * subscribers. Used by `pnpm attribution` for the Saturday check.
 * Post ID = utm_content (see the UTM convention in the README).
 * No "server-only" import, so the CLI can load it.
 */

export interface AttributionRow {
  status: "pending" | "active" | "unsubscribed";
  createdAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  referrer: string | null;
}

export interface Bucket {
  signedUp: number;
  /** Signed up in the period and clicked the confirmation link (also if they left later). */
  confirmed: number;
}

export interface AttributionReport {
  from: string;
  to: string;
  days: number;
  period: Bucket & { unsubscribed: number };
  /** Right now, all time. */
  activeNow: number;
  /** Pending for more than 48 hours (confirmation email lost, in spam, or ignored). */
  unconfirmed48h: number;
  /** email, social, community, search, print, paid, referral, direct, other. */
  byChannelGroup: ({ channel: Channel } & Bucket)[];
  byChannel: ({ source: string; medium: string } & Bucket)[];
  byPost: ({ postId: string; source: string; campaign: string } & Bucket)[];
}

/** utm_source, else "ref:<host>" for untagged links from another site, else "direct". */
export function sourceLabel(r: Pick<AttributionRow, "utmSource" | "referrer">): string {
  return r.utmSource ?? (r.referrer ? `ref:${r.referrer}` : "direct");
}

function add(map: Map<string, Bucket>, key: string, confirmed: boolean) {
  const b = map.get(key) ?? { signedUp: 0, confirmed: 0 };
  b.signedUp += 1;
  if (confirmed) b.confirmed += 1;
  map.set(key, b);
}

const byConfirmedThenSignups = (a: Bucket, b: Bucket) => b.confirmed - a.confirmed || b.signedUp - a.signedUp;

/** Pure: the report for the `days` days before `now`. */
export function summarizeAttribution(rows: AttributionRow[], now: Date, days = 7): AttributionReport {
  const since = new Date(now.getTime() - days * 86_400_000);
  const stale = new Date(now.getTime() - 48 * 3_600_000);
  const inPeriod = rows.filter((r) => r.createdAt >= since && r.createdAt <= now);
  const groups = new Map<string, Bucket>();
  const channels = new Map<string, Bucket>();
  const posts = new Map<string, Bucket>();
  for (const r of inPeriod) {
    const confirmed = r.confirmedAt !== null;
    add(groups, channelOf(r), confirmed);
    add(channels, JSON.stringify([sourceLabel(r), r.utmMedium ?? "-"]), confirmed);
    add(posts, JSON.stringify([r.utmContent ?? "(none)", sourceLabel(r), r.utmCampaign ?? "-"]), confirmed);
  }
  return {
    from: since.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
    days,
    period: {
      signedUp: inPeriod.length,
      confirmed: inPeriod.filter((r) => r.confirmedAt !== null).length,
      unsubscribed: rows.filter((r) => r.unsubscribedAt && r.unsubscribedAt >= since && r.unsubscribedAt <= now).length,
    },
    activeNow: rows.filter((r) => r.status === "active").length,
    unconfirmed48h: rows.filter((r) => r.status === "pending" && r.createdAt < stale).length,
    byChannelGroup: [...groups].map(([channel, b]) => ({ channel: channel as Channel, ...b })).sort(byConfirmedThenSignups),
    byChannel: [...channels]
      .map(([k, b]) => {
        const [source, medium] = JSON.parse(k) as [string, string];
        return { source, medium, ...b };
      })
      .sort(byConfirmedThenSignups),
    byPost: [...posts]
      .map(([k, b]) => {
        const [postId, source, campaign] = JSON.parse(k) as [string, string, string];
        return { postId, source, campaign, ...b };
      })
      .sort(byConfirmedThenSignups),
  };
}

export async function loadAttributionRows(db: Database): Promise<AttributionRow[]> {
  return db
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
    })
    .from(subscriber);
}

function table(head: string[], rows: (string | number)[][]): string[] {
  const all = [head, ...rows.map((r) => r.map(String))];
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  const text = head.length - 2; // leading text columns, then the two numbers
  const line = (r: string[]) => r.map((c, i) => (i < text ? c.padEnd(w[i]) : c.padStart(w[i]))).join("  ");
  return all.map((r) => line(r as string[]));
}

/** Plain-text version for the terminal (and for pasting into the weekly summary). */
export function formatAttribution(r: AttributionReport): string {
  const out = [
    `Sign-ups ${r.from} to ${r.to} (${r.days} days)`,
    `  signed up ${r.period.signedUp} · confirmed ${r.period.confirmed} · unsubscribed ${r.period.unsubscribed}`,
    `  active subscribers now ${r.activeNow} · unconfirmed after 48 h ${r.unconfirmed48h}`,
    "",
    "By channel group",
    ...(r.byChannelGroup.length
      ? table(["channel", "signed up", "confirmed"], r.byChannelGroup.map((c) => [c.channel, c.signedUp, c.confirmed])).map((l) => `  ${l}`)
      : ["  (no sign-ups)"]),
    "",
    "By source",
    ...(r.byChannel.length
      ? table(["source", "medium", "signed up", "confirmed"], r.byChannel.map((c) => [c.source, c.medium, c.signedUp, c.confirmed])).map((l) => `  ${l}`)
      : ["  (no sign-ups)"]),
    "",
    "By post (utm_content)",
    ...(r.byPost.length
      ? table(["post", "source", "campaign", "signed up", "confirmed"], r.byPost.map((p) => [p.postId, p.source, p.campaign, p.signedUp, p.confirmed])).map((l) => `  ${l}`)
      : ["  (no sign-ups)"]),
  ];
  return out.join("\n");
}
