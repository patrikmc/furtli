import { describe, expect, it } from "vitest";
import { type SubscriberRow, summarizeNeon } from "./neon";
import { periodForWeek } from "./period";

const p = periodForWeek("2026-W40"); // 26 Sep 22:00Z → 3 Oct 22:00Z
const d = (s: string) => new Date(s);
const sub = (o: Partial<SubscriberRow>): SubscriberRow => ({
  status: "active",
  createdAt: d("2026-09-01T10:00:00Z"),
  confirmedAt: d("2026-09-01T10:30:00Z"),
  unsubscribedAt: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  referrer: null,
  lang: "de",
  digest: false,
  ...o,
});

describe("summarizeNeon", () => {
  const subscribers = [
    sub({}), // active all week
    sub({ digest: true, lang: "en" }),
    sub({ status: "unsubscribed", unsubscribedAt: d("2026-09-30T08:00:00Z") }), // left this week
    sub({ createdAt: d("2026-09-28T09:00:00Z"), confirmedAt: d("2026-09-28T11:00:00Z"), utmSource: "instagram", utmMedium: "social" }),
    sub({ createdAt: d("2026-09-29T09:00:00Z"), confirmedAt: d("2026-09-29T09:30:00Z"), utmContent: "p03-reel" }),
    sub({ status: "pending", createdAt: d("2026-09-30T09:00:00Z"), confirmedAt: null }), // unconfirmed > 48 h at the end
    sub({ status: "pending", createdAt: d("2026-10-03T20:00:00Z"), confirmedAt: null }), // too recent to count as stale
    sub({ createdAt: d("2026-10-05T09:00:00Z"), confirmedAt: d("2026-10-05T09:10:00Z") }), // after the week: ignored
  ];
  const n = summarizeNeon(
    {
      subscribers,
      subscriptions: [
        { plz: "8004", stationId: null, topics: ["paper", "mrh"], subscriberStatus: "active" },
        { plz: null, stationId: "mrh-stauffacher", topics: ["mrh"], subscriberStatus: "active" },
        { plz: "8003", stationId: null, topics: [], subscriberStatus: "active" }, // nothing confirmed yet
        { plz: "8005", stationId: null, topics: ["waste"], subscriberStatus: "unsubscribed" },
      ],
      emails: [{ kind: "reminder", status: "sent", count: 12 }],
      ingests: [{ status: "ok", startedAt: d("2026-09-30T03:00:00Z"), finishedAt: d("2026-09-30T03:01:00Z") }],
      lastIngest: { status: "ok", startedAt: d("2026-09-30T03:00:00Z"), finishedAt: d("2026-09-30T03:01:00Z") },
    },
    p,
  );

  it("counts sign-ups, confirmations and unsubscribes inside the week only", () => {
    expect(n.subscribers).toMatchObject({ signedUp: 4, signedUpAndConfirmed: 2, newConfirmed: 2, unsubscribed: 1, net: 1 });
  });

  it("derives active-at-start/end and churn from timestamps", () => {
    expect(n.subscribers.activeAtStart).toBe(3);
    expect(n.subscribers.activeAtEnd).toBe(4);
    expect(n.subscribers.churnPct).toBe(33.3);
  });

  it("reports median time to confirm, stale pending sign-ups and the digest share", () => {
    expect(n.subscribers.medianHoursToConfirm).toBe(1.3); // 2 h and 0.5 h
    expect(n.subscribers.unconfirmed48h).toBe(1);
    expect(n.subscribers.digestPct).toBe(25);
    expect(n.subscribers.byLang).toEqual([
      { key: "de", count: 3 },
      { key: "en", count: 1 },
    ]);
  });

  it("groups active subscriptions and attributes sign-ups", () => {
    expect(n.subscriptions.active).toBe(2);
    expect(n.subscriptions.byTopic).toEqual([
      { key: "mrh", count: 2 },
      { key: "paper", count: 1 },
    ]);
    expect(n.subscriptions.byStation).toEqual([{ key: "mrh-stauffacher", count: 1 }]);
    expect(n.attribution.byChannelGroup.find((c) => c.channel === "social")).toMatchObject({ signedUp: 1, confirmed: 1 });
    expect(n.ingest).toMatchObject({ runs: 1, failed: 0, lastStatus: "ok" });
  });
});
