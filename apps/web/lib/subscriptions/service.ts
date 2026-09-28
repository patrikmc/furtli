import "server-only";
import { randomBytes } from "node:crypto";
import { and, emailLog, eq, isNotNull, sql, station, subscriber, subscription, type Database, type Subscriber } from "db";
import { confirmPageUrl, listUnsubscribeHeaders, mapPath, trackedUrl, unsubscribePageUrl } from "@/lib/email/links";
import type { Mailer } from "@/lib/email/mailer";
import { renderConfirm, renderWelcome } from "@/lib/email/render";
import { zurichToday } from "@/lib/server/today";
import { loadPlanEvents } from "./events";
import { CONSENT_TEXT, STATION_TOPICS, targetFromInput, type SubscribeInput, type TargetInput, type Topic } from "./input";
import { addDays, itemsFor } from "./plan";
import { activeTargets, loadTargets, pendingSettingsOf, primaryTarget, settingsOf, summaryOf, type Settings } from "./targets";

/**
 * Subscribe → confirm (double opt-in) → unsubscribe.
 *
 * An address can follow several things (a postcode, a station, …), one
 * `subscription` row each. Signing up again ADDS a target, or changes the
 * collection types of a target it already follows; it never replaces the
 * others. Account settings are shared: the evening reminder and the weekly
 * overview cover everything followed, and once switched on by any sign-up
 * they stay on (switching off comes with the self-service page).
 *
 * Every change of preferences needs a click in an email to the address, so
 * nobody can sign up (or re-configure) someone else. The API always answers
 * the same way, whether the address is known or not.
 */
export interface Deps {
  db: Database;
  mailer: Mailer;
  now?: Date;
}

/** Minimum time between two confirmation emails to the same address. */
const RESEND_AFTER_MS = 2 * 60 * 1000;
/** A confirmation link is valid this long. */
const CONFIRM_VALID_MS = 7 * 24 * 60 * 60 * 1000;

export class SubscriptionInputError extends Error {}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

async function stationInfo(db: Database, id: string | null) {
  if (!id) return null;
  const [s] = await db.select({ id: station.id, name: station.name, kind: station.kind }).from(station).where(eq(station.id, id)).limit(1);
  return s ?? null;
}

/** Record the requested types for one target; they become active on confirmation. */
async function requestTarget(db: Database, subscriberId: number, t: TargetInput, source: string | null, now: Date) {
  await db
    .insert(subscription)
    .values({ subscriberId, plz: t.plz, stationId: t.stationId, pendingTopics: t.topics, source, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [subscription.subscriberId, subscription.plz, subscription.stationId],
      set: { pendingTopics: t.topics, updatedAt: now },
    });
}

/** Settings after this sign-up: latest language; reminders/digest stay on once chosen. */
function mergeSettings(current: Settings, input: SubscribeInput): Settings {
  return { lang: input.lang, reminders: current.reminders || input.reminders, digest: current.digest || input.digest };
}

export type SubscribeOutcome = "sent" | "throttled" | "ignored";

export async function subscribe(deps: Deps, input: SubscribeInput): Promise<SubscribeOutcome> {
  if (input.website) return "ignored"; // honeypot filled in: a bot
  const { db, mailer } = deps;
  const now = deps.now ?? new Date();
  const target = targetFromInput(input);
  const source = input.source ?? null;

  if (target.stationId) {
    const s = await stationInfo(db, target.stationId);
    if (!s || !STATION_TOPICS.includes(s.kind as Topic)) throw new SubscriptionInputError("Unknown station");
  }

  // The form is German-only for now, so the German consent text is what people saw.
  const consent = { consentText: CONSENT_TEXT.de, consentAt: now };
  let [row] = await db.select().from(subscriber).where(eq(subscriber.email, input.email)).limit(1);
  let isUpdate = false;

  if (!row) {
    const a = input.attribution ?? {};
    [row] = await db
      .insert(subscriber)
      .values({
        email: input.email,
        status: "pending",
        lang: input.lang,
        reminders: input.reminders,
        digest: input.digest,
        confirmToken: newToken(),
        unsubscribeToken: newToken(),
        ...consent,
        signupSource: source,
        utmSource: a.utmSource ?? null,
        utmMedium: a.utmMedium ?? null,
        utmCampaign: a.utmCampaign ?? null,
        utmContent: a.utmContent ?? null,
        utmTerm: a.utmTerm ?? null,
        referrer: a.referrer ?? null,
        landingPath: a.landingPath ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    // Lost a race with a parallel request for the same address: carry on with that row.
    if (!row) [row] = await db.select().from(subscriber).where(eq(subscriber.email, input.email)).limit(1);
  } else {
    const token = row.confirmToken ?? newToken();
    if (row.status === "active") {
      isUpdate = true;
      const pendingPrefs = mergeSettings(pendingSettingsOf(row) ?? settingsOf(row), input);
      [row] = await db
        .update(subscriber)
        .set({ pendingPrefs, confirmToken: token, ...consent, updatedAt: now })
        .where(eq(subscriber.id, row.id))
        .returning();
    } else {
      // Pending: add to what is waiting for confirmation. Unsubscribed: start afresh.
      const fresh = row.status === "unsubscribed";
      if (fresh) {
        await db
          .update(subscription)
          .set({ topics: sql`'{}'::event_type[]`, pendingTopics: null, updatedAt: now })
          .where(eq(subscription.subscriberId, row.id));
      }
      const settings = fresh ? { lang: input.lang, reminders: input.reminders, digest: input.digest } : mergeSettings(settingsOf(row), input);
      [row] = await db
        .update(subscriber)
        .set({ status: "pending", ...settings, pendingPrefs: null, confirmToken: token, ...consent, updatedAt: now })
        .where(eq(subscriber.id, row.id))
        .returning();
    }
  }
  await requestTarget(db, row.id, target, source, now);

  if (row.confirmSentAt && now.getTime() - row.confirmSentAt.getTime() < RESEND_AFTER_MS) return "throttled";

  const rows = await loadTargets(db, [row.id]);
  const settings = pendingSettingsOf(row) ?? settingsOf(row);
  const email = await renderConfirm({
    lang: settings.lang,
    confirmUrl: confirmPageUrl(row.confirmToken!),
    mapUrl: trackedUrl(mapPath(target), "welcome"),
    summary: summaryOf(rows, settings, "preview"),
    isUpdate,
  });
  const [result] = await mailer.sendBatch([
    { to: row.email, ...email, tags: [{ name: "kind", value: "confirm" }] },
  ]);
  await db
    .insert(emailLog)
    .values({
      subscriberId: row.id,
      kind: "confirm",
      key: `${row.confirmToken}:${now.toISOString()}`,
      status: result.error ? "failed" : result.dev ? "dev" : "sent",
      providerId: result.id ?? null,
      error: result.error ?? null,
      createdAt: now,
      sentAt: result.error ? null : now,
    })
    .onConflictDoNothing();
  await db.update(subscriber).set({ confirmSentAt: now }).where(eq(subscriber.id, row.id));
  if (result.error) throw new Error(`Confirmation email failed: ${result.error}`);
  return "sent";
}

/** For the confirmation page: the whole subscription as it will be, with new/changed parts marked. */
export async function confirmPreview(db: Database, token: string, now = new Date()) {
  const [s] = await db.select().from(subscriber).where(eq(subscriber.confirmToken, token)).limit(1);
  if (!s) return null;
  const expired = !!s.confirmSentAt && now.getTime() - s.confirmSentAt.getTime() > CONFIRM_VALID_MS;
  const settings = pendingSettingsOf(s) ?? settingsOf(s);
  const summary = summaryOf(await loadTargets(db, [s.id]), settings, "preview");
  return { expired, isUpdate: s.status === "active", lang: settings.lang, summary };
}

export type ConfirmOutcome = "confirmed" | "invalid" | "expired";

export async function confirm(deps: Deps, token: string): Promise<ConfirmOutcome> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const [s] = await db.select().from(subscriber).where(eq(subscriber.confirmToken, token)).limit(1);
  if (!s) return "invalid";
  if (s.confirmSentAt && now.getTime() - s.confirmSentAt.getTime() > CONFIRM_VALID_MS) return "expired";

  const pending = pendingSettingsOf(s);
  const wasActive = s.status === "active";
  // Every requested target becomes active (added or changed); the others stay as they are.
  await db
    .update(subscription)
    .set({
      topics: sql`${subscription.pendingTopics}`,
      pendingTopics: null,
      // Raw sql params bypass Drizzle's type mapping: postgres-js (production) rejects a Date here, PGlite (tests) accepts it.
      confirmedAt: sql`coalesce(${subscription.confirmedAt}, ${now.toISOString()}::timestamptz)`,
      updatedAt: now,
    })
    .where(and(eq(subscription.subscriberId, s.id), isNotNull(subscription.pendingTopics)));
  const [row] = await db
    .update(subscriber)
    .set({
      status: "active",
      ...(pending ?? {}),
      pendingPrefs: null,
      confirmToken: null,
      confirmedAt: s.confirmedAt ?? now,
      unsubscribedAt: null,
      updatedAt: now,
    })
    .where(eq(subscriber.id, s.id))
    .returning();

  if (!wasActive) await sendWelcome(deps, row, now);
  return "confirmed";
}

async function sendWelcome(deps: Deps, s: Subscriber, now: Date) {
  const { db, mailer } = deps;
  const settings = settingsOf(s);
  const rows = await loadTargets(db, [s.id]);
  const today = zurichToday(now);
  const events = await loadPlanEvents(db, addDays(today, 1), addDays(today, 35));
  const next = itemsFor({ id: s.id, targets: activeTargets(rows) }, events).slice(0, 4);
  const email = await renderWelcome({
    lang: settings.lang,
    summary: summaryOf(rows, settings),
    next,
    mapUrl: trackedUrl(mapPath(primaryTarget(rows)), "welcome"),
    unsubscribeUrl: unsubscribePageUrl(s.unsubscribeToken),
  });
  const [claimed] = await db
    .insert(emailLog)
    .values({ subscriberId: s.id, kind: "welcome", key: "welcome", createdAt: now })
    .onConflictDoNothing()
    .returning();
  if (!claimed) return; // welcomed before (re-subscribe after unsubscribing)
  const [r] = await mailer.sendBatch([
    {
      to: s.email,
      ...email,
      headers: listUnsubscribeHeaders(s.unsubscribeToken),
      tags: [{ name: "kind", value: "welcome" }],
    },
  ]);
  await db
    .update(emailLog)
    .set({ status: r.error ? "failed" : r.dev ? "dev" : "sent", providerId: r.id ?? null, error: r.error ?? null, sentAt: r.error ? null : now })
    .where(eq(emailLog.id, claimed.id));
}

export type UnsubscribeOutcome = "unsubscribed" | "invalid";

export async function unsubscribe(deps: Deps, token: string): Promise<UnsubscribeOutcome> {
  const now = deps.now ?? new Date();
  const [s] = await deps.db.select().from(subscriber).where(eq(subscriber.unsubscribeToken, token)).limit(1);
  if (!s) return "invalid";
  if (s.status !== "unsubscribed") {
    await deps.db
      .update(subscriber)
      .set({ status: "unsubscribed", unsubscribedAt: now, confirmToken: null, pendingPrefs: null, updatedAt: now })
      .where(eq(subscriber.id, s.id));
    // Keep what they followed (for the record); drop anything still waiting for confirmation.
    await deps.db.update(subscription).set({ pendingTopics: null, updatedAt: now }).where(eq(subscription.subscriberId, s.id));
  }
  return "unsubscribed";
}
