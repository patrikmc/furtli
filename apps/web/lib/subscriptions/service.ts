import "server-only";
import { randomBytes } from "node:crypto";
import { emailLog, eq, station, subscriber, type Database, type Subscriber } from "db";
import { asLang } from "@/lib/email/copy";
import { confirmPageUrl, listUnsubscribeHeaders, mapPath, trackedUrl, unsubscribePageUrl } from "@/lib/email/links";
import type { Mailer } from "@/lib/email/mailer";
import { renderConfirm, renderWelcome } from "@/lib/email/render";
import type { SubscriptionSummary } from "@/lib/email/types";
import { zurichToday } from "@/lib/server/today";
import { loadPlanEvents } from "./events";
import { CONSENT_TEXT, STATION_TOPICS, prefsFromInput, type Prefs, type SubscribeInput, type Topic } from "./input";
import { addDays, itemsFor } from "./plan";

/**
 * Subscribe → confirm (double opt-in) → unsubscribe.
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

function prefsColumns(p: Prefs) {
  return { lang: p.lang, plz: p.plz, stationId: p.stationId, topics: p.topics, reminders: p.reminders, digest: p.digest };
}

async function stationInfo(db: Database, id: string | null) {
  if (!id) return null;
  const [s] = await db.select({ id: station.id, name: station.name, kind: station.kind }).from(station).where(eq(station.id, id)).limit(1);
  return s ?? null;
}

async function summaryFor(db: Database, p: Prefs): Promise<SubscriptionSummary> {
  const s = await stationInfo(db, p.stationId);
  return { plz: p.plz, stationName: s?.name ?? null, topics: p.topics, reminders: p.reminders, digest: p.digest };
}

function prefsOf(s: Subscriber): Prefs {
  return {
    lang: asLang(s.lang),
    plz: s.plz,
    stationId: s.stationId,
    topics: s.topics as Topic[],
    reminders: s.reminders,
    digest: s.digest,
  };
}

export type SubscribeOutcome = "sent" | "throttled" | "ignored";

export async function subscribe(deps: Deps, input: SubscribeInput): Promise<SubscribeOutcome> {
  if (input.website) return "ignored"; // honeypot filled in: a bot
  const { db, mailer } = deps;
  const now = deps.now ?? new Date();
  const prefs = prefsFromInput(input);

  if (prefs.stationId) {
    const s = await stationInfo(db, prefs.stationId);
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
        ...prefsColumns(prefs),
        confirmToken: newToken(),
        unsubscribeToken: newToken(),
        ...consent,
        signupSource: input.source ?? null,
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
      [row] = await db
        .update(subscriber)
        .set({ pendingPrefs: prefs, confirmToken: token, ...consent, updatedAt: now })
        .where(eq(subscriber.id, row.id))
        .returning();
    } else {
      [row] = await db
        .update(subscriber)
        .set({ status: "pending", ...prefsColumns(prefs), pendingPrefs: null, confirmToken: token, ...consent, updatedAt: now })
        .where(eq(subscriber.id, row.id))
        .returning();
    }
  }

  if (row.confirmSentAt && now.getTime() - row.confirmSentAt.getTime() < RESEND_AFTER_MS) return "throttled";

  const lang = prefs.lang;
  const email = await renderConfirm({
    lang,
    confirmUrl: confirmPageUrl(row.confirmToken!),
    mapUrl: trackedUrl(mapPath(prefs), "welcome"),
    summary: await summaryFor(db, prefs),
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

/** For the confirmation page: what is about to be confirmed. */
export async function confirmPreview(db: Database, token: string, now = new Date()) {
  const [s] = await db.select().from(subscriber).where(eq(subscriber.confirmToken, token)).limit(1);
  if (!s) return null;
  const expired = !!s.confirmSentAt && now.getTime() - s.confirmSentAt.getTime() > CONFIRM_VALID_MS;
  const prefs = (s.pendingPrefs as Prefs | null) ?? prefsOf(s);
  return { expired, isUpdate: s.status === "active", lang: prefs.lang, summary: await summaryFor(db, prefs) };
}

export type ConfirmOutcome = "confirmed" | "invalid" | "expired";

export async function confirm(deps: Deps, token: string): Promise<ConfirmOutcome> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const [s] = await db.select().from(subscriber).where(eq(subscriber.confirmToken, token)).limit(1);
  if (!s) return "invalid";
  if (s.confirmSentAt && now.getTime() - s.confirmSentAt.getTime() > CONFIRM_VALID_MS) return "expired";

  const pending = s.pendingPrefs as Prefs | null;
  const wasActive = s.status === "active";
  const [row] = await db
    .update(subscriber)
    .set({
      status: "active",
      ...(pending ? prefsColumns(pending) : {}),
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
  const prefs = prefsOf(s);
  const today = zurichToday(now);
  const events = await loadPlanEvents(db, addDays(today, 1), addDays(today, 35));
  const next = itemsFor({ id: s.id, plz: s.plz, stationId: s.stationId, topics: prefs.topics }, events).slice(0, 4);
  const email = await renderWelcome({
    lang: prefs.lang,
    summary: await summaryFor(db, prefs),
    next,
    mapUrl: trackedUrl(mapPath(prefs), "welcome"),
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
  }
  return "unsubscribed";
}
