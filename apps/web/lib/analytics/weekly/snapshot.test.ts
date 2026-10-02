import { describe, expect, it } from "vitest";
import { fixtureSnapshot } from "./fixtures";
import { parseSources } from "./run";
import { defaultSources, mergeSnapshot } from "./snapshot";

const cfg = { auth: { kind: "apiKey" as const, apiKey: "k" }, websiteId: "w", baseUrl: "https://api.umami.is/v1" };

describe("sources", () => {
  it("collects Neon by default and Umami only when its API is configured", () => {
    expect(defaultSources(null)).toEqual(["neon"]);
    expect(defaultSources(cfg)).toEqual(["neon", "umami"]);
    expect(parseSources(undefined, null)).toEqual(["neon"]);
    expect(parseSources("all", null)).toEqual(["neon", "umami"]);
    expect(parseSources("umami,neon,umami", null)).toEqual(["umami", "neon"]);
    expect(() => parseSources("ga4", null)).toThrow(/Unknown source/);
  });
});

describe("mergeSnapshot", () => {
  const stored = { ...fixtureSnapshot(), errors: [{ source: "umami" as const, message: "HTTP 500" }] };

  it("a Neon-only run replaces the Neon part and keeps the stored Umami part and its gaps", () => {
    const fresh = { ...fixtureSnapshot(), umami: null, neon: { ...stored.neon!, subscribers: { ...stored.neon!.subscribers, signedUp: 99 } }, errors: [] };
    const m = mergeSnapshot(fresh, stored, ["neon"]);
    expect(m.umami).toEqual(stored.umami);
    expect(m.neon?.subscribers.signedUp).toBe(99);
    expect(m.errors).toEqual([{ source: "umami", message: "HTTP 500" }]);
    expect(m.derived.activationPct).toBe(60); // recomputed from the kept Umami part
  });

  it("an Umami run clears old Umami gaps and keeps Neon", () => {
    const fresh = { ...fixtureSnapshot(), neon: null, errors: [] };
    const m = mergeSnapshot(fresh, stored, ["umami"]);
    expect(m.neon).toEqual(stored.neon);
    expect(m.errors).toEqual([]);
  });

  it("without a stored row the fresh snapshot is used as is", () => {
    const fresh = fixtureSnapshot();
    expect(mergeSnapshot(fresh, null, ["neon"])).toBe(fresh);
  });
});
