// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, type Database } from "db";
import * as schema from "db/schema";
import type { Mailer, OutgoingEmail } from "@/lib/email/mailer";

vi.mock("server-only", () => ({}));

const { subscribe, confirm, unsubscribe } = await import("./service");
const { runScheduledEmails } = await import("./scheduled");
const { subscribeSchema } = await import("./input");
const { subscriberReport, formatReport } = await import("./admin");

/**
 * The whole subscription flow against real Postgres (PGlite, in-process, with
 * the actual migrations): double opt-in, attribution, reminders exactly once,
 * digest, adding and changing subscriptions, admin lookup, unsubscribe.
 */
class FakeMailer implements Mailer {
  readonly kind = "resend" as const;
  sent: OutgoingEmail[] = [];
  async sendBatch(messages: OutgoingEmail[]) {
    this.sent.push(...messages);
    return messages.map((_, i) => ({ id: `fake-${this.sent.length - messages.length + i}` }));
  }
  last() {
    return this.sent[this.sent.length - 1];
  }
}

let db: Database;
const mailer = new FakeMailer();
// Monday 26 Oct 2026, 16:00 in Zürich.
const MON = new Date("2026-10-26T15:00:00Z");
const TUE = new Date("2026-10-27T15:00:00Z");
const later = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

function tokenFrom(html: string, path: string): string {
  const m = html.match(new RegExp(`${path.replace(/[/?]/g, "\\$&")}\\?t=([A-Za-z0-9_-]+)`));
  if (!m) throw new Error(`no ${path} link`);
  return m[1];
}

const input = (over: Record<string, unknown> = {}) =>
  subscribeSchema.parse({
    email: "anna@example.ch",
    plz: "8004",
    topics: ["cardboard", "mrh"],
    digest: true,
    consent: true,
    source: "nearby",
    attribution: { utmSource: "instagram", utmCampaign: "reel-wasserkocher", referrer: "l.instagram.com", landingPath: "/" },
    ...over,
  });

beforeAll(async () => {
  const pg = new PGlite();
  const dir = join(__dirname, "../../../../packages/db/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await pg.exec(stmt);
    }
  }
  db = drizzle(pg, { schema }) as unknown as Database;
  const [src] = await db
    .insert(schema.sourceFile)
    .values({ dataset: "test", url: "x", sha256: "x", bytes: 1, rowCount: 1, content: "{}" })
    .returning();
  await db.insert(schema.station).values([
    { id: "mrh-a", kind: "mrh", name: "Stauffacher", address: "St. Jakobstrasse 29", plz: "8004", kreis: 4, lng: 8.53, lat: 47.37, sourcePoiId: "1", sourceName: "Stauffacher" },
    { id: "sst-1", kind: "sammelstelle", name: "Somewhere", plz: "8004", kreis: 4, lng: 8.52, lat: 47.37, sourcePoiId: "2", sourceName: "x" },
  ]);
  const e = (type: schema.EventTypeValue, date: string, plz: string, stationId: string | null = null) => ({ type, date, plz, stationId, sourceFileId: src.id });
  await db.insert(schema.collectionEvent).values([
    e("cardboard", "2026-10-27", "8004"),
    e("mrh", "2026-10-27", "8004", "mrh-a"),
    e("mrh", "2026-10-27", "8003", "mrh-a"),
    e("paper", "2026-10-29", "8004"),
    e("cardboard", "2026-10-27", "8003"),
    e("cardboard", "2026-10-28", "8003"),
  ]);
});

const targetsOf = async (email: string) => {
  const [s] = await db.select().from(schema.subscriber).where(eq(schema.subscriber.email, email));
  const rows = await db.select().from(schema.subscription).where(eq(schema.subscription.subscriberId, s.id)).orderBy(schema.subscription.id);
  return rows.map((r) => ({ plz: r.plz, stationId: r.stationId, topics: r.topics, pendingTopics: r.pendingTopics }));
};

describe("subscription flow", () => {
  let unsubscribeToken = "";

  it("sign-up stores a pending subscriber with attribution and sends only a confirmation", async () => {
    expect(await subscribe({ db, mailer, now: MON }, input())).toBe("sent");
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.last().subject).toBe("Bitte bestätige deine Erinnerungen");
    const [s] = await db.select().from(schema.subscriber);
    expect(s).toMatchObject({ status: "pending", digest: true, utmSource: "instagram", utmCampaign: "reel-wasserkocher", referrer: "l.instagram.com", signupSource: "nearby" });
    expect(s.consentText).toMatch(/Erinnerungen/);
    expect(await targetsOf("anna@example.ch")).toEqual([{ plz: "8004", stationId: null, topics: [], pendingTopics: ["cardboard", "mrh"] }]);
    // Pending subscribers get nothing.
    expect((await runScheduledEmails({ db, mailer, now: MON })).planned.reminders).toBe(0);
  });

  it("a second click within two minutes doesn't send another email; bots are ignored", async () => {
    expect(await subscribe({ db, mailer, now: later(MON, 1) }, input())).toBe("throttled");
    expect(await subscribe({ db, mailer, now: MON }, input({ email: "bot@example.ch", website: "x" }))).toBe("ignored");
    expect(mailer.sent).toHaveLength(1);
    expect(await db.select().from(schema.subscriber)).toHaveLength(1);
  });

  it("confirming activates, sends the welcome email once, and the link can't be reused", async () => {
    const token = tokenFrom(mailer.last().html, "/abo/bestaetigen");
    expect(await confirm({ db, mailer, now: later(MON, 5) }, token)).toBe("confirmed");
    expect(await targetsOf("anna@example.ch")).toEqual([{ plz: "8004", stationId: null, topics: ["cardboard", "mrh"], pendingTopics: null }]);
    const welcome = mailer.last();
    expect(welcome.subject).toBe("Du bist dabei: deine Erinnerungen sind aktiv");
    expect(welcome.text).toContain("Postleitzahl 8004: Karton, Mobiler Recyclinghof");
    expect(welcome.html).toContain("utm_source=welcome");
    expect(welcome.html).toContain("/abo/abmelden?t=");
    expect(welcome.html).toContain("lang=de");
    expect(welcome.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    unsubscribeToken = tokenFrom(welcome.html, "/abo/abmelden");
    expect(await confirm({ db, mailer, now: later(MON, 6) }, token)).toBe("invalid");
  });

  it("the evening run sends one reminder with all of tomorrow's items, exactly once", async () => {
    const before = mailer.sent.length;
    const r = await runScheduledEmails({ db, mailer, now: MON });
    expect(r).toMatchObject({ reminderDate: "2026-10-27", sent: 1, failed: 0, digest: null, mailer: "resend", activeSubscribers: 1 });
    const m = mailer.last();
    expect(m.subject).toBe("Morgen: Karton und Mobiler Recyclinghof");
    expect(m.html).toContain("Stauffacher");
    expect(m.html).toContain("/abholen?station=mrh-a");
    expect(m.text).toContain("Dein Abo");
    expect(m.text).toContain("Postleitzahl 8004: Karton, Mobiler Recyclinghof");
    expect(m.headers?.["List-Unsubscribe"]).toContain(`/api/email/unsubscribe?t=${unsubscribeToken}`);
    const again = await runScheduledEmails({ db, mailer, now: later(MON, 10) });
    expect(again).toMatchObject({ alreadySent: 1, sent: 0 });
    expect(mailer.sent.length).toBe(before + 1);
  });

  it("the weekly overview groups the week by day, only with the chosen topics", async () => {
    const r = await runScheduledEmails({ db, mailer, now: MON }, { forceDigest: true });
    expect(r.planned.digests).toBe(1);
    expect(r.sent).toBe(1); // the reminder was already sent
    expect(mailer.last().subject).toMatch(/^Deine Woche: /);
    expect(mailer.last().html).toContain("Dienstag, 27. Oktober");
    // Wednesday only has cardboard in 8003, Thursday only paper: neither is followed.
    expect(mailer.last().html).not.toContain("Mittwoch, 28. Oktober");
    expect(mailer.last().html).not.toContain("Donnerstag, 29. Oktober");
    expect(mailer.last().text).toContain("Wochenübersicht am Sonntagabend");
  });

  it("subscribing to a second place adds it (after confirmation) and keeps the first", async () => {
    const n = mailer.sent.length;
    // digest: false on this form must not switch off the weekly overview chosen before.
    expect(await subscribe({ db, mailer, now: later(MON, 30) }, input({ plz: "8003", topics: ["cardboard"], digest: false }))).toBe("sent");
    const c = mailer.last();
    expect(c.subject).toBe("Bitte bestätige deine neuen Einstellungen");
    expect(c.text).toContain("Postleitzahl 8004: Karton, Mobiler Recyclinghof");
    expect(c.text).toContain("Postleitzahl 8003: Karton (neu)");
    // Nothing changes until the click.
    expect((await targetsOf("anna@example.ch"))[1]).toMatchObject({ plz: "8003", topics: [], pendingTopics: ["cardboard"] });

    expect(await confirm({ db, mailer, now: later(MON, 31) }, tokenFrom(c.html, "/abo/bestaetigen"))).toBe("confirmed");
    expect(await targetsOf("anna@example.ch")).toEqual([
      { plz: "8004", stationId: null, topics: ["cardboard", "mrh"], pendingTopics: null },
      { plz: "8003", stationId: null, topics: ["cardboard"], pendingTopics: null },
    ]);
    const [s] = await db.select().from(schema.subscriber).where(eq(schema.subscriber.email, "anna@example.ch"));
    expect(s).toMatchObject({ status: "active", digest: true, pendingPrefs: null });
    expect(mailer.sent.length).toBe(n + 1); // no second welcome

    // Tuesday evening: Wednesday's cardboard in 8003 now counts, and the email lists both places.
    const r = await runScheduledEmails({ db, mailer, now: TUE }, { forceDigest: true });
    expect(r.planned).toEqual({ reminders: 1, digests: 1 });
    const [reminder, digest] = mailer.sent.slice(-2);
    expect(reminder.subject).toBe("Morgen: Karton");
    expect(digest.html).toContain("Mittwoch, 28. Oktober");
    for (const m of [reminder, digest]) {
      expect(m.text).toContain("Postleitzahl 8004: Karton, Mobiler Recyclinghof");
      expect(m.text).toContain("Postleitzahl 8003: Karton");
    }
  });

  it("subscribing to a place again changes only that place's collections", async () => {
    expect(await subscribe({ db, mailer, now: later(MON, 40) }, input({ topics: ["paper"], lang: "en" }))).toBe("sent");
    const c = mailer.last();
    expect(c.subject).toBe("Please confirm your new settings");
    expect(c.text).toContain("Postcode 8004: Paper (changed)");
    // Links open the site in the email's language.
    expect(c.html).toMatch(/\/abo\/bestaetigen\?t=[A-Za-z0-9_-]+&amp;lang=en/);
    expect(c.text).toContain("Postcode 8003: Cardboard");
    expect((await targetsOf("anna@example.ch"))[0].topics).toEqual(["cardboard", "mrh"]);
    expect(await confirm({ db, mailer, now: later(MON, 41) }, tokenFrom(c.html, "/abo/bestaetigen"))).toBe("confirmed");
    expect((await targetsOf("anna@example.ch")).map((t) => [t.plz, t.topics])).toEqual([
      ["8004", ["paper"]],
      ["8003", ["cardboard"]],
    ]);
    const [s] = await db.select().from(schema.subscriber).where(eq(schema.subscriber.email, "anna@example.ch"));
    expect(s).toMatchObject({ lang: "en", digest: true });
  });

  it("admin lookup by email shows the full subscription, upcoming dates and the email log", async () => {
    expect(await subscriberReport(db, "nobody@example.ch")).toBeNull();
    const r = (await subscriberReport(db, "  Anna@Example.ch ", { now: MON }))!;
    expect(r).toMatchObject({ email: "anna@example.ch", status: "active", settings: { lang: "en", reminders: true, digest: true } });
    expect(r.subscriptions.map((x) => [x.plz, x.topics, x.active])).toEqual([
      ["8004", ["paper"], true],
      ["8003", ["cardboard"], true],
    ]);
    expect(r.summary).toEqual(["Postleitzahl 8004: Papier", "Postleitzahl 8003: Karton", "E-Mail am Vorabend", "Wochenübersicht am Sonntagabend"]);
    expect(r.upcoming.map((i) => `${i.date} ${i.type}`)).toEqual(["2026-10-27 cardboard", "2026-10-28 cardboard", "2026-10-29 paper"]);
    expect(new Set(r.emails.map((e) => e.kind))).toEqual(new Set(["confirm", "welcome", "reminder", "digest"]));
    expect(r.attribution.utmSource).toBe("instagram");
    const text = formatReport(r);
    expect(text).toContain("PLZ 8003  ACTIVE");
    expect(text).not.toMatch(/confirm .*[A-Za-z0-9_-]{32}/); // no live confirm tokens in the output
  });

  it("unsubscribing stops everything", async () => {
    expect(await unsubscribe({ db, mailer, now: later(MON, 50) }, unsubscribeToken)).toBe("unsubscribed");
    expect(await unsubscribe({ db, mailer }, "nope")).toBe("invalid");
    const r = await runScheduledEmails({ db, mailer, now: later(TUE, 24 * 60) }, { forceDigest: true });
    expect(r.planned).toEqual({ reminders: 0, digests: 0 });
    expect(r.note).toBe("No active (confirmed) subscribers.");
  });

  it("signing up again after unsubscribing starts afresh", async () => {
    expect(await subscribe({ db, mailer, now: later(MON, 60) }, input({ plz: null, stationId: "mrh-a", topics: ["mrh"], digest: false }))).toBe("sent");
    expect(mailer.last().text).not.toContain("8003");
    await confirm({ db, mailer, now: later(MON, 61) }, tokenFrom(mailer.last().html, "/abo/bestaetigen"));
    const r = (await subscriberReport(db, "anna@example.ch", { now: MON }))!;
    expect(r.subscriptions.filter((x) => x.active).map((x) => x.station?.id)).toEqual(["mrh-a"]);
    expect(r.settings.digest).toBe(false);
  });

  it("two sign-ups before confirming both count (the old bug: the second replaced the first)", async () => {
    const c = { email: "carla@example.ch" };
    expect(await subscribe({ db, mailer, now: MON }, input({ ...c, topics: ["paper"] }))).toBe("sent");
    const token = tokenFrom(mailer.last().html, "/abo/bestaetigen");
    expect(await subscribe({ db, mailer, now: later(MON, 1) }, input({ ...c, plz: null, stationId: "mrh-a", topics: ["mrh"] }))).toBe("throttled");
    expect(await confirm({ db, mailer, now: later(MON, 2) }, token)).toBe("confirmed");
    expect((await targetsOf("carla@example.ch")).map((t) => [t.plz ?? t.stationId, t.topics])).toEqual([
      ["8004", ["paper"]],
      ["mrh-a", ["mrh"]],
    ]);
    expect(mailer.last().text).toContain("Standort: Stauffacher: Mobiler Recyclinghof");
  });

  it("station subscriptions must point at an MRH or Sonderabfallmobil stop", async () => {
    await expect(
      subscribe({ db, mailer, now: MON }, input({ email: "b@example.ch", plz: null, stationId: "sst-1", topics: ["mrh"] })),
    ).rejects.toThrow("Unknown station");
    expect(await subscribe({ db, mailer, now: MON }, input({ email: "b@example.ch", plz: null, stationId: "mrh-a", topics: ["mrh"] }))).toBe("sent");
    expect(mailer.last().html).toContain("Standort: Stauffacher");
  });
});
