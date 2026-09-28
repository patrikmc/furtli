import "server-only";
import { and, emailLog, eq, inArray, subscriber, type Database, type Subscriber } from "db";
import { listUnsubscribeHeaders, mapPath, trackedUrl, unsubscribePageUrl } from "@/lib/email/links";
import { emailFrom, type Mailer, type OutgoingEmail, type SendResult } from "@/lib/email/mailer";
import { renderDigest, renderReminder, type RenderedEmail } from "@/lib/email/render";
import type { EmailItem } from "@/lib/email/types";
import { zurichToday } from "@/lib/server/today";
import { loadPlanEvents } from "./events";
import { addDays, planDigests, planReminders, weekday } from "./plan";
import { activeTargets, bySubscriber, loadTargets, primaryTarget, settingsOf, summaryOf, type TargetRow } from "./targets";

/**
 * The daily email run (Vercel Cron → /api/cron/emails, late afternoon):
 * - reminders for tomorrow's collections, one email per subscriber covering
 *   everything they follow;
 * - on Sundays, the weekly overview for Monday–Sunday, likewise for all of it.
 * Every email ends with the subscriber's whole subscription ("why you get this").
 *
 * Each email is "claimed" in email_log before it is sent (unique on
 * subscriber + kind + key), so overlapping or repeated runs never send the
 * same reminder twice. A failed send stays "failed" and is not retried
 * automatically; the run summary reports it.
 */
export interface RunSummary {
  today: string;
  reminderDate: string;
  digest: { from: string; to: string } | null;
  planned: { reminders: number; digests: number };
  alreadySent: number;
  sent: number;
  failed: number;
  dev: number;
  dryRun: boolean;
  /** Diagnostics: why a run sent nothing. */
  mailer: "resend" | "dev";
  from: string;
  activeSubscribers: number;
  eventsInWindow: number;
  note?: string;
}

interface Job {
  sub: Subscriber;
  kind: "reminder" | "digest";
  key: string;
  render: () => Promise<RenderedEmail>;
}

function planSub(s: Subscriber, rows: TargetRow[]) {
  return { id: s.id, targets: activeTargets(rows), row: s, rows };
}

function pickupUrl(items: EmailItem[], campaign: "reminder" | "digest"): string | null {
  const mrh = items.find((i) => i.type === "mrh" && i.stationId);
  return mrh ? trackedUrl(`/abholen?station=${encodeURIComponent(mrh.stationId!)}`, campaign, "pickup") : null;
}

export async function runScheduledEmails(
  deps: { db: Database; mailer: Mailer; now?: Date },
  opts: { dryRun?: boolean; forceDigest?: boolean } = {},
): Promise<RunSummary> {
  const { db, mailer } = deps;
  const now = deps.now ?? new Date();
  const today = zurichToday(now);
  const tomorrow = addDays(today, 1);
  const withDigest = opts.forceDigest || weekday(today) === 0;
  const digestTo = addDays(tomorrow, 6);

  const subs = await db.select().from(subscriber).where(eq(subscriber.status, "active"));
  const targets = bySubscriber(await loadTargets(db, subs.map((s) => s.id)));
  const planned = subs.map((s) => planSub(s, targets.get(s.id) ?? []));
  const events = await loadPlanEvents(db, tomorrow, withDigest ? digestTo : tomorrow);

  const reminders = planReminders(
    planned.filter((p) => p.row.reminders),
    events,
    tomorrow,
  );
  const digests = withDigest
    ? planDigests(
        planned.filter((p) => p.row.digest),
        events,
        tomorrow,
        digestTo,
      )
    : [];

  const jobs: Job[] = [
    ...reminders.map(({ sub, items }) => ({
      sub: sub.row,
      kind: "reminder" as const,
      key: tomorrow,
      render: () =>
        renderReminder({
          lang: settingsOf(sub.row).lang,
          date: tomorrow,
          items,
          summary: summaryOf(sub.rows, settingsOf(sub.row)),
          mapUrl: trackedUrl(mapPath(primaryTarget(sub.rows)), "reminder"),
          pickupUrl: pickupUrl(items, "reminder"),
          unsubscribeUrl: unsubscribePageUrl(sub.row.unsubscribeToken),
        }),
    })),
    ...digests.map(({ sub, days }) => ({
      sub: sub.row,
      kind: "digest" as const,
      key: `${tomorrow}..${digestTo}`,
      render: () =>
        renderDigest({
          lang: settingsOf(sub.row).lang,
          from: tomorrow,
          to: digestTo,
          days,
          summary: summaryOf(sub.rows, settingsOf(sub.row)),
          mapUrl: trackedUrl(mapPath(primaryTarget(sub.rows)), "digest"),
          pickupUrl: pickupUrl(
            days.flatMap((d) => d.items),
            "digest",
          ),
          unsubscribeUrl: unsubscribePageUrl(sub.row.unsubscribeToken),
        }),
    })),
  ];

  const summary: RunSummary = {
    today,
    reminderDate: tomorrow,
    digest: withDigest ? { from: tomorrow, to: digestTo } : null,
    planned: { reminders: reminders.length, digests: digests.length },
    alreadySent: 0,
    sent: 0,
    failed: 0,
    dev: 0,
    dryRun: !!opts.dryRun,
    mailer: mailer.kind,
    from: emailFrom(),
    activeSubscribers: subs.length,
    eventsInWindow: events.length,
  };
  if (mailer.kind === "dev") summary.note = "RESEND_API_KEY is not set for this deployment: emails are only logged, not sent.";
  else if (subs.length === 0) summary.note = "No active (confirmed) subscribers.";
  else if (events.length === 0) summary.note = `No collection dates in the database for ${tomorrow}${withDigest ? `..${digestTo}` : ""}. Has the ingest run on this database?`;
  else if (jobs.length === 0) summary.note = `No subscriber has one of their chosen collections on ${tomorrow}.`;
  if (opts.dryRun || jobs.length === 0) return summary;

  // Claim every job; rows that already exist were handled by an earlier run.
  const claimed = await db
    .insert(emailLog)
    .values(jobs.map((j) => ({ subscriberId: j.sub.id, kind: j.kind, key: j.key, createdAt: now })))
    .onConflictDoNothing()
    .returning({ id: emailLog.id, subscriberId: emailLog.subscriberId, kind: emailLog.kind });
  const logId = new Map(claimed.map((c) => [`${c.subscriberId}|${c.kind}`, c.id]));
  const todo = jobs.filter((j) => logId.has(`${j.sub.id}|${j.kind}`));
  summary.alreadySent = jobs.length - todo.length;

  for (let i = 0; i < todo.length; i += 100) {
    const chunk = todo.slice(i, i + 100);
    const messages: OutgoingEmail[] = await Promise.all(
      chunk.map(async (j) => ({
        to: j.sub.email,
        ...(await j.render()),
        headers: listUnsubscribeHeaders(j.sub.unsubscribeToken),
        tags: [{ name: "kind", value: j.kind }],
      })),
    );
    let results: SendResult[];
    try {
      results = await mailer.sendBatch(messages);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results = chunk.map(() => ({ error: msg }));
    }
    for (const [k, r] of results.entries()) {
      const j = chunk[k];
      const status = r.error ? "failed" : r.dev ? "dev" : "sent";
      summary[status === "failed" ? "failed" : status === "dev" ? "dev" : "sent"]++;
      await db
        .update(emailLog)
        .set({ status, providerId: r.id ?? null, error: r.error ?? null, sentAt: r.error ? null : now })
        .where(and(eq(emailLog.id, logId.get(`${j.sub.id}|${j.kind}`)!), inArray(emailLog.status, ["queued"])));
    }
  }
  return summary;
}
