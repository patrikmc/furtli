import { describe, expect, it } from "vitest";
import { currentPeriod, isoWeek, lastCompletePeriod, periodForWeek, previousWeeks, zurichMidnight } from "./period";

describe("reporting week (Sunday–Saturday, Europe/Zurich)", () => {
  it("on Sunday morning reports the week that just ended", () => {
    const p = lastCompletePeriod(new Date("2026-10-04T05:00:00Z")); // Sun 07:00 CEST
    expect(p).toMatchObject({ week: "2026-W40", firstDay: "2026-09-27", lastDay: "2026-10-03" });
    expect(p.start.toISOString()).toBe("2026-09-26T22:00:00.000Z");
    expect(p.end.toISOString()).toBe("2026-10-03T22:00:00.000Z");
  });

  it("late on Saturday still reports the previous complete week", () => {
    expect(lastCompletePeriod(new Date("2026-10-03T21:30:00Z")).week).toBe("2026-W39");
  });

  it("handles the DST changes (the week is 169 h in October, 167 h in March)", () => {
    const oct = periodForWeek("2026-W44");
    expect(oct.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect((oct.end.getTime() - oct.start.getTime()) / 3_600_000).toBe(169);
    const mar = periodForWeek("2027-W13");
    expect((mar.end.getTime() - mar.start.getTime()) / 3_600_000).toBe(167);
    expect(zurichMidnight("2027-03-28").toISOString()).toBe("2027-03-27T23:00:00.000Z");
  });

  it("labels weeks by ISO 8601, including week 53", () => {
    expect(isoWeek("2026-12-31")).toBe("2026-W53");
    expect(isoWeek("2027-01-02")).toBe("2026-W53");
    expect(isoWeek("2027-01-04")).toBe("2027-W01");
    expect(previousWeeks("2027-W02", 3)).toEqual(["2027-W01", "2026-W53", "2026-W52"]);
  });

  it("rejects malformed weeks", () => {
    expect(() => periodForWeek("2026-40")).toThrow();
    expect(() => periodForWeek("2025-W53")).toThrow();
  });
});

describe("currentPeriod", () => {
  it("is the running Sunday–Saturday week, labelled by its Saturday", () => {
    const p = currentPeriod(new Date("2026-10-02T10:00:00Z")); // Fri 2 Oct
    expect(p).toMatchObject({ week: "2026-W40", firstDay: "2026-09-27", lastDay: "2026-10-03" });
    expect(currentPeriod(new Date("2026-10-03T21:30:00Z")).week).toBe("2026-W40"); // Sat 23:30 CEST
    expect(currentPeriod(new Date("2026-10-03T22:30:00Z")).week).toBe("2026-W41"); // Sun 00:30 CEST: new week
  });
});
