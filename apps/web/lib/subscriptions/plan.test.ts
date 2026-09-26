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

const byPlz: PlanSubscriber = { id: 1, plz: "8004", stationId: null, topics: ["cardboard", "paper", "mrh"] };
const byStation: PlanSubscriber = { id: 2, plz: null, stationId: "mrh-a", topics: ["mrh"] };

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

describe("itemsFor", () => {
  it("dedupes a station date listed for several postcodes and sorts by date, then type", () => {
    const items = itemsFor({ ...byStation, plz: null }, [
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
    const r = planReminders([byPlz, byStation, { id: 3, plz: "8001", stationId: null, topics: ["paper"] }], events, "2026-10-27");
    expect(r.map((x) => [x.sub.id, x.items.map((i) => i.type)])).toEqual([
      [1, ["cardboard", "mrh"]],
      [2, ["mrh"]],
    ]);
  });

  it("digests group the week by day and skip empty weeks", () => {
    const d = planDigests([byPlz, { id: 3, plz: "8001", stationId: null, topics: ["paper"] }], events, "2026-10-26", "2026-11-01");
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
