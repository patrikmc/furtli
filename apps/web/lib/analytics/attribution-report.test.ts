import { describe, expect, it } from "vitest";
import { formatAttribution, sourceLabel, summarizeAttribution, type AttributionRow } from "./attribution-report";

const NOW = new Date("2026-11-07T10:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const row = (over: Partial<AttributionRow>): AttributionRow => ({
  status: "active",
  createdAt: daysAgo(1),
  confirmedAt: daysAgo(1),
  unsubscribedAt: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  referrer: null,
  ...over,
});

describe("summarizeAttribution", () => {
  const rows = [
    row({ utmSource: "instagram", utmMedium: "social", utmCampaign: "w2-launch", utmContent: "p07-reel-glas" }),
    row({ utmSource: "instagram", utmMedium: "social", utmCampaign: "w2-launch", utmContent: "p07-reel-glas" }),
    row({ utmSource: "instagram", utmMedium: "social", utmCampaign: "w2-launch", utmContent: "p07-reel-glas", status: "pending", confirmedAt: null }),
    row({ utmSource: "reddit", utmMedium: "community", utmCampaign: "w2-launch", utmContent: "p05-reddit-launch" }),
    row({ referrer: "www.google.com" }),
    row({}),
    // Outside the 7-day window, but still pending > 48 h and still active.
    row({ createdAt: daysAgo(10), status: "pending", confirmedAt: null }),
    row({ createdAt: daysAgo(20), unsubscribedAt: daysAgo(2), status: "unsubscribed" }),
  ];
  const r = summarizeAttribution(rows, NOW, 7);

  it("counts the period, active subscribers and stale confirmations", () => {
    expect(r.from).toBe("2026-10-31");
    expect(r.period).toEqual({ signedUp: 6, confirmed: 5, unsubscribed: 1 });
    expect(r.activeNow).toBe(5);
    expect(r.unconfirmed48h).toBe(1);
  });

  it("groups by channel and by post, best first", () => {
    expect(r.byChannel[0]).toEqual({ source: "instagram", medium: "social", signedUp: 3, confirmed: 2 });
    expect(r.byChannel.map((c) => c.source)).toEqual(expect.arrayContaining(["reddit", "ref:www.google.com", "direct"]));
    expect(r.byPost[0]).toEqual({ postId: "p07-reel-glas", source: "instagram", campaign: "w2-launch", signedUp: 3, confirmed: 2 });
    // Untagged sign-ups stay split by where they came from (Google vs direct).
    const untagged = r.byPost.filter((p) => p.postId === "(none)");
    expect(untagged.map((p) => [p.source, p.signedUp]).sort()).toEqual([
      ["direct", 1],
      ["ref:www.google.com", 1],
    ]);
  });

  it("labels untagged visits by referrer, else direct", () => {
    expect(sourceLabel({ utmSource: null, referrer: "l.instagram.com" })).toBe("ref:l.instagram.com");
    expect(sourceLabel({ utmSource: "qr-mrh-stauffacher", referrer: "x" })).toBe("qr-mrh-stauffacher");
    expect(sourceLabel({ utmSource: null, referrer: null })).toBe("direct");
  });

  it("prints a readable table and handles an empty week", () => {
    expect(formatAttribution(r)).toContain("p07-reel-glas");
    expect(formatAttribution(summarizeAttribution([], NOW))).toContain("(no sign-ups)");
  });
});
