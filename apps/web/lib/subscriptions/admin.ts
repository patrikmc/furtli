import { desc, emailLog, eq, subscriber, type Database } from "db";
import { formatShortDate, TYPE_LABELS } from "@/lib/email/copy";
import { summaryLines } from "@/lib/email/summary";
import type { EmailItem } from "@/lib/email/types";
import { zurichToday } from "@/lib/server/today";
import { loadPlanEvents } from "./events";
import { addDays, itemsFor } from "./plan";
import { activeTargets, loadTargets, pendingSettingsOf, settingsOf, summaryOf, type Settings } from "./targets";

/**
 * Admin: everything we know about one address's subscription.
 * Used by the CLI (`pnpm --filter web subscriber <email>`) and by
 * GET /api/internal/subscriber?email=… (Authorization: Bearer $ADMIN_SECRET).
 * No "server-only" import, so the CLI can load it.
 */
export interface SubscriberReport {
  email: string;
  id: number;
  status: "pending" | "active" | "unsubscribed";
  settings: Settings;
  /** Settings an active subscriber asked for but hasn't confirmed yet. */
  pendingSettings: Settings | null;
  /** The whole confirmed subscription, exactly as the emails show it. */
  summary: string[];
  subscriptions: {
    id: number;
    plz: string | null;
    station: { id: string; name: string | null; kind: string | null } | null;
    /** Confirmed types; empty = not active. */
    topics: string[];
    /** Requested types waiting for the confirmation click. */
    pendingTopics: string[] | null;
    active: boolean;
    source: string | null;
    createdAt: string;
    confirmedAt: string | null;
    updatedAt: string;
  }[];
  /** What the next reminders/digests would contain (next `days` days). */
  upcoming: EmailItem[];
  consent: { text: string | null; at: string | null };
  dates: { createdAt: string; confirmedAt: string | null; unsubscribedAt: string | null; confirmSentAt: string | null; updatedAt: string };
  attribution: Record<string, string | null>;
  /** Most recent emails first. */
  emails: { kind: string; key: string; status: string; providerId: string | null; error: string | null; createdAt: string; sentAt: string | null }[];
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function subscriberReport(
  db: Database,
  email: string,
  opts: { now?: Date; days?: number; emailLimit?: number } = {},
): Promise<SubscriberReport | null> {
  const address = email.trim().toLowerCase();
  const [s] = await db.select().from(subscriber).where(eq(subscriber.email, address)).limit(1);
  if (!s) return null;

  const rows = await loadTargets(db, [s.id]);
  const settings = settingsOf(s);
  const today = zurichToday(opts.now ?? new Date());
  const events = await loadPlanEvents(db, addDays(today, 1), addDays(today, opts.days ?? 14));
  const upcoming = s.status === "active" ? itemsFor({ id: s.id, targets: activeTargets(rows) }, events) : [];
  const emails = await db
    .select()
    .from(emailLog)
    .where(eq(emailLog.subscriberId, s.id))
    .orderBy(desc(emailLog.createdAt), desc(emailLog.id))
    .limit(opts.emailLimit ?? 50);

  return {
    email: s.email,
    id: s.id,
    status: s.status,
    settings,
    pendingSettings: pendingSettingsOf(s),
    summary: summaryLines(summaryOf(rows, settings), "de"),
    subscriptions: rows.map((r) => ({
      id: r.id,
      plz: r.plz,
      station: r.stationId ? { id: r.stationId, name: r.stationName, kind: r.stationKind } : null,
      topics: r.topics,
      pendingTopics: r.pendingTopics,
      active: s.status === "active" && r.topics.length > 0,
      source: r.source,
      createdAt: r.createdAt.toISOString(),
      confirmedAt: iso(r.confirmedAt),
      updatedAt: r.updatedAt.toISOString(),
    })),
    upcoming,
    consent: { text: s.consentText, at: iso(s.consentAt) },
    dates: {
      createdAt: s.createdAt.toISOString(),
      confirmedAt: iso(s.confirmedAt),
      unsubscribedAt: iso(s.unsubscribedAt),
      confirmSentAt: iso(s.confirmSentAt),
      updatedAt: s.updatedAt.toISOString(),
    },
    attribution: {
      signupSource: s.signupSource,
      utmSource: s.utmSource,
      utmMedium: s.utmMedium,
      utmCampaign: s.utmCampaign,
      utmContent: s.utmContent,
      utmTerm: s.utmTerm,
      referrer: s.referrer,
      landingPath: s.landingPath,
    },
    emails: emails.map((e) => ({
      kind: e.kind,
      key: e.kind === "confirm" ? e.key.replace(/^[^:]+:/, "…:") : e.key, // don't print live confirm tokens
      status: e.status,
      providerId: e.providerId,
      error: e.error,
      createdAt: e.createdAt.toISOString(),
      sentAt: iso(e.sentAt),
    })),
  };
}

/** Plain-text rendering for the terminal. */
export function formatReport(r: SubscriberReport): string {
  const L: string[] = [];
  const t = (x: string[]) => x.map((k) => TYPE_LABELS.de[k as keyof typeof TYPE_LABELS.de] ?? k).join(", ");
  L.push(`${r.email}  (#${r.id}, ${r.status})`);
  L.push(`  created ${r.dates.createdAt}  confirmed ${r.dates.confirmedAt ?? "–"}  unsubscribed ${r.dates.unsubscribedAt ?? "–"}`);
  L.push(`  settings: lang=${r.settings.lang} reminders=${r.settings.reminders} digest=${r.settings.digest}`);
  if (r.pendingSettings) L.push(`  pending settings: lang=${r.pendingSettings.lang} reminders=${r.pendingSettings.reminders} digest=${r.pendingSettings.digest}`);
  L.push("", "Subscriptions:");
  if (!r.subscriptions.length) L.push("  (none)");
  for (const x of r.subscriptions) {
    const where = x.station ? `station ${x.station.name ?? x.station.id} [${x.station.id}]` : `PLZ ${x.plz}`;
    L.push(`  #${x.id} ${where}${x.station && x.plz ? ` + PLZ ${x.plz}` : ""}  ${x.active ? "ACTIVE" : "inactive"}`);
    L.push(`      topics: ${x.topics.length ? t(x.topics) : "–"}${x.pendingTopics ? `   pending: ${t(x.pendingTopics)}` : ""}`);
    L.push(`      source ${x.source ?? "–"}, created ${x.createdAt}, confirmed ${x.confirmedAt ?? "–"}`);
  }
  L.push("", "As shown in emails:", ...r.summary.map((l) => `  • ${l}`));
  L.push("", `Upcoming dates (${r.upcoming.length}):`);
  for (const i of r.upcoming) L.push(`  ${formatShortDate(i.date, "de")}  ${TYPE_LABELS.de[i.type]}${i.stationName ? ` – ${i.stationName}` : ""}`);
  const a = Object.entries(r.attribution).filter(([, v]) => v);
  L.push("", `Attribution: ${a.length ? a.map(([k, v]) => `${k}=${v}`).join(" ") : "–"}`);
  L.push(`Consent: ${r.consent.at ?? "–"} "${r.consent.text ?? ""}"`);
  L.push("", `Emails (latest ${r.emails.length}):`);
  for (const e of r.emails) L.push(`  ${e.createdAt}  ${e.kind.padEnd(8)} ${e.status.padEnd(7)} ${e.key}${e.error ? `  ERROR ${e.error}` : ""}`);
  return L.join("\n");
}
