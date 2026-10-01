import type { Snapshot } from "./snapshot";

/** Test data: one week of numbers in the stored shape. */
export function fixtureSnapshot(week = "2026-W40", scale = 1): Snapshot {
  const k = (n: number) => Math.round(n * scale);
  return {
    week,
    startsAt: "2026-09-26T22:00:00.000Z",
    endsAt: "2026-10-03T22:00:00.000Z",
    version: 1,
    umami: {
      stats: { visitors: k(200), visits: k(260), pageviews: k(300), bounces: k(80), totaltime: 9000 },
      visitorsWith: { first_action: k(120), place_search: k(110), station_open: k(60), subscribe_open: k(20), subscribe_submit: k(8) },
      events: { first_action: k(130), place_search: k(240) },
      props: {
        "visit_source.channel": [
          { value: "social", total: k(120) },
          { value: "direct", total: k(80) },
        ],
        "first_action.action": [
          { value: "search_plz", total: k(70) },
          { value: "search_map", total: k(60) },
        ],
        "place_search.results": [
          { value: "3-5", total: k(150) },
          { value: "0", total: k(30) },
        ],
        "map_ready.within": [{ value: "1-2s", total: k(180) }],
      },
      top: { referrer: [{ value: "instagram.com", total: k(90) }] },
      performance: null,
    },
    neon: {
      subscribers: {
        signedUp: k(10),
        signedUpAndConfirmed: k(7),
        newConfirmed: k(8),
        unsubscribed: 1,
        net: k(8) - 1,
        activeAtStart: k(40),
        activeAtEnd: k(47),
        churnPct: 2.5,
        medianHoursToConfirm: 0.4,
        unconfirmed48h: 2,
        digestPct: 30,
        byLang: [{ key: "de", count: k(40) }],
      },
      attribution: {
        byChannelGroup: [{ channel: "social", signedUp: k(6), confirmed: k(5) }],
        byChannel: [],
        byPost: [{ postId: "p08-reddit-launch", source: "reddit", campaign: "w2-launch", signedUp: 3, confirmed: 2 }],
      },
      subscriptions: { active: k(50), byTopic: [{ key: "paper", count: k(40) }], byPlz: [{ key: "8004", count: k(20) }], byStation: [] },
      emails: [{ kind: "reminder", status: "sent", count: k(90) }],
      ingest: { runs: 1, failed: 0, lastStatus: "ok", lastFinishedAt: "2026-10-01T03:00:00.000Z" },
    },
    derived: {
      activationPct: 60,
      searchSuccessPct: 83.3,
      funnel: [
        { step: "Visitors", visitors: k(200), pctOfVisitors: 100 },
        { step: "Used the map (first_action)", visitors: k(120), pctOfVisitors: 60 },
      ],
      confirmPct: 70,
    },
    errors: [],
    generatedAt: "2026-10-04T05:00:12.000Z",
  };
}
