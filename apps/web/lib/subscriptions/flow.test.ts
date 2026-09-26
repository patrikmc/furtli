// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "db";
import * as schema from "db/schema";
import type { Mailer, OutgoingEmail } from "@/lib/email/mailer";

vi.mock("server-only", () => ({}));

const { subscribe, confirm, unsubscribe } = await import("./service");
const { runScheduledEmails } = await import("./scheduled");
const { subscribeSchema } = await import("./input");

/**
 * The whole subscription flow against real Postgres (PGlite, in-process, with
 * the actual migrations): double opt-in, attribution, reminders exactly once,
 * digest, preference changes, unsubscribe.
 */
class FakeMailer implements Mailer {
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
  ]);
});

describe("subscription flow", () => {
  let unsubscribeToken = "";

  it("sign-up stores a pending subscriber with attribution and sends only a confirmation", async () => {
    expect(await subscribe({ db, mailer, now: MON }, input())).toBe("sent");
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.last().subject).toBe("Bitte bestätige deine Erinnerungen");
    const [s] = await db.select().from(schema.subscriber);
    expect(s).toMatchObject({ status: "pending", plz: "8004", utmSource: "instagram", utmCampaign: "reel-wasserkocher", referrer: "l.instagram.com", signupSource: "nearby" });
    expect(s.consentText).toMatch(/Erinnerungen/);
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
    const welcome = mailer.last();
    expect(welcome.subject).toBe("Du bist dabei: deine Erinnerungen sind aktiv");
    expect(welcome.html).toContain("utm_source=welcome");
    expect(welcome.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    unsubscribeToken = tokenFrom(welcome.html, "/abo/abmelden");
    expect(await confirm({ db, mailer, now: later(MON, 6) }, token)).toBe("invalid");
  });

  it("the evening run sends one reminder with all of tomorrow's items, exactly once", async () => {
    const before = mailer.sent.length;
    const r = await runScheduledEmails({ db, mailer, now: MON });
    expect(r).toMatchObject({ reminderDate: "2026-10-27", sent: 1, failed: 0, digest: null });
    const m = mailer.last();
    expect(m.subject).toBe("Morgen: Karton und Mobiler Recyclinghof");
    expect(m.html).toContain("Stauffacher");
    expect(m.html).toContain("/abholen?station=mrh-a");
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
    // Thursday only has paper, which this subscriber didn't choose.
    expect(mailer.last().html).not.toContain("Donnerstag, 29. Oktober");
  });

  it("an active subscriber's changes wait for confirmation; no second welcome", async () => {
    const n = mailer.sent.length;
    expect(await subscribe({ db, mailer, now: later(MON, 30) }, input({ topics: ["paper"], lang: "en" }))).toBe("sent");
    expect(mailer.last().subject).toBe("Please confirm your new settings");
    let [s] = await db.select().from(schema.subscriber);
    expect(s.topics).toEqual(["cardboard", "mrh"]);
    expect(await confirm({ db, mailer, now: later(MON, 31) }, tokenFrom(mailer.last().html, "/abo/bestaetigen"))).toBe("confirmed");
    [s] = await db.select().from(schema.subscriber);
    expect(s).toMatchObject({ topics: ["paper"], lang: "en", status: "active", pendingPrefs: null });
    expect(mailer.sent.length).toBe(n + 1);
  });

  it("unsubscribing stops everything", async () => {
    expect(await unsubscribe({ db, mailer, now: later(MON, 40) }, unsubscribeToken)).toBe("unsubscribed");
    expect(await unsubscribe({ db, mailer }, "nope")).toBe("invalid");
    const tue = later(MON, 24 * 60);
    expect((await runScheduledEmails({ db, mailer, now: tue }, { forceDigest: true })).planned).toEqual({ reminders: 0, digests: 0 });
  });

  it("station subscriptions must point at an MRH or Sonderabfallmobil stop", async () => {
    await expect(
      subscribe({ db, mailer, now: MON }, input({ email: "b@example.ch", plz: null, stationId: "sst-1", topics: ["mrh"] })),
    ).rejects.toThrow("Unknown station");
    expect(await subscribe({ db, mailer, now: MON }, input({ email: "b@example.ch", plz: null, stationId: "mrh-a", topics: ["mrh"] }))).toBe("sent");
    expect(mailer.last().html).toContain("Standort: Stauffacher");
  });
});
