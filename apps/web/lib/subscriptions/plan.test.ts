import { describe, expect, it } from "vitest";
import { addDays, itemsFor, matches, planDigests, planReminders, weekday, type PlanEvent, type PlanSubscriber } from "./plan";

const ev = (type: PlanEvent["type"], date: string, plz: string, stationId: string | null = null): PlanEvent => ({
  type,
  date,
  plz,
  stationId,
  stationName: stationId ? "Stauffacher" : null,
  address: null,
  time: stationId ? "15–19 Uhr" : null,
});

const byPlz: PlanSubscriber = { id: 1, targets: [{ plz: "8004", stationId: null, topics: ["cardboard", "paper", "mrh"] }] };
const byStation: PlanSubscriber = { id: 2, targets: [{ plz: null, stationId: "mrh-a", topics: ["mrh"] }] };
/** Subscribed twice: paper for home (8004), and the MRH stop near work (8001). */
const both: PlanSubscriber = {
  id: 3,
  targets: [
    { plz: "8004", stationId: null, topics: ["paper"] },
    { plz: null, stationId: "mrh-a", topics: ["mrh"] },
    { plz: "8001", stationId: null, topics: ["cardboard"] },
  ],
};

describe("matches", () => {
  it("kerbside dates go by postcode and topic", () => {
    expect(matches(byPlz, ev("cardboard", "2026-10-28", "8004"))).toBe(true);
    expect(matches(byPlz, ev("cardboard", "2026-10-28", "8003"))).toBe(false);
    expect(matches(byPlz, ev("waste", "2026-10-28", "8004"))).toBe(false);
  });

  it("MRH dates: the chosen station, else every stop assigned to the postcode", () => {
    expect(matches(byPlz, ev("mrh", "2026-10-30", "8004", "mrh-a"))).toBe(true);
    expect(matches(byPlz, ev("mrh", "2026-10-30", "8004", "mrh-b"))).toBe(true);
    expect(matches(byStation, ev("mrh", "2026-10-30", "8004", "mrh-a"))).toBe(true);
    expect(matches(byStation, ev("mrh", "2026-10-30", "8003", "mrh-a"))).toBe(true);
    expect(matches(byStation, ev("mrh", "2026-10-30", "8004", "mrh-b"))).toBe(false);
  });
});

describe("several subscriptions", () => {
  it("an event counts if any target matches, each target with its own types", () => {
    expect(matches(both, ev("paper", "2026-10-28", "8004"))).toBe(true);
    expect(matches(both, ev("cardboard", "2026-10-28", "8004"))).toBe(false);
    expect(matches(both, ev("cardboard", "2026-10-28", "8001"))).toBe(true);
    expect(matches(both, ev("paper", "2026-10-28", "8001"))).toBe(false);
    expect(matches(both, ev("mrh", "2026-10-30", "8004", "mrh-b"))).toBe(false);
    expect(matches({ id: 4, targets: [] }, ev("paper", "2026-10-28", "8004"))).toBe(false);
  });

  it("one weekly overview covers all targets, and a date reached twice is listed once", () => {
    const events = [
      ev("paper", "2026-10-27", "8004"),
      ev("cardboard", "2026-10-27", "8001"),
      ev("mrh", "2026-10-29", "8004", "mrh-a"),
      ev("mrh", "2026-10-29", "8001", "mrh-a"),
    ];
    const withPlzMrh: PlanSubscriber = { id: 5, targets: [...both.targets, { plz: "8004", stationId: null, topics: ["mrh"] }] };
    const [d] = planDigests([withPlzMrh], events, "2026-10-26", "2026-11-01");
    expect(d.days.map((x) => [x.date, x.items.map((i) => i.type)])).toEqual([
      ["2026-10-27", ["paper", "cardboard"]],
      ["2026-10-29", ["mrh"]],
    ]);
  });
});

describe("itemsFor", () => {
  it("dedupes a station date listed for several postcodes and sorts by date, then type", () => {
    const items = itemsFor(byStation, [
      ev("mrh", "2026-10-30", "8004", "mrh-a"),
      ev("mrh", "2026-10-30", "8003", "mrh-a"),
      ev("mrh", "2026-10-27", "8004", "mrh-a"),
    ]);
    expect(items.map((i) => i.date)).toEqual(["2026-10-27", "2026-10-30"]);
    const mixed = itemsFor(byPlz, [ev("mrh", "2026-10-28", "8004", "mrh-a"), ev("paper", "2026-10-28", "8004"), ev("cardboard", "2026-10-28", "8004")]);
    expect(mixed.map((i) => i.type)).toEqual(["paper", "cardboard", "mrh"]);
  });
});

describe("planReminders / planDigests", () => {
  const events = [
    ev("cardboard", "2026-10-27", "8004"),
    ev("mrh", "2026-10-27", "8004", "mrh-a"),
    ev("paper", "2026-10-29", "8004"),
    ev("paper", "2026-11-05", "8004"),
  ];

  it("one reminder per subscriber with all of tomorrow's items; nobody without items", () => {
    const r = planReminders([byPlz, byStation, { id: 3, targets: [{ plz: "8001", stationId: null, topics: ["paper"] }] }], events, "2026-10-27");
    expect(r.map((x) => [x.sub.id, x.items.map((i) => i.type)])).toEqual([
      [1, ["cardboard", "mrh"]],
      [2, ["mrh"]],
    ]);
  });

  it("digests group the week by day and skip empty weeks", () => {
    const d = planDigests([byPlz, { id: 3, targets: [{ plz: "8001", stationId: null, topics: ["paper"] }] }], events, "2026-10-26", "2026-11-01");
    expect(d).toHaveLength(1);
    expect(d[0].days.map((x) => [x.date, x.items.length])).toEqual([
      ["2026-10-27", 2],
      ["2026-10-29", 1],
    ]);
  });
});

describe("date helpers", () => {
  it("adds days across month ends and the DST change", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("knows Sundays", () => {
    expect(weekday("2026-10-25")).toBe(0);
    expect(weekday("2026-10-26")).toBe(1);
  });
});
