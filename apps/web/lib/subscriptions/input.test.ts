import { describe, expect, it } from "vitest";
import { subscribeSchema } from "./input";

const base = { email: "  Anna@Example.CH ", plz: "8004", topics: ["cardboard", "cardboard", "mrh"], consent: true };

describe("subscribeSchema", () => {
  it("normalises the address, dedupes topics and fills defaults", () => {
    const r = subscribeSchema.parse(base);
    expect(r.email).toBe("anna@example.ch");
    expect(r.topics).toEqual(["cardboard", "mrh"]);
    expect(r).toMatchObject({ lang: "de", reminders: true, digest: false, stationId: null });
  });

  it("requires consent, a place, a topic and a valid address", () => {
    expect(subscribeSchema.safeParse({ ...base, consent: false }).success).toBe(false);
    expect(subscribeSchema.safeParse({ ...base, plz: null }).success).toBe(false);
    expect(subscribeSchema.safeParse({ ...base, topics: [] }).success).toBe(false);
    expect(subscribeSchema.safeParse({ ...base, topics: ["glass"] }).success).toBe(false);
    expect(subscribeSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
    expect(subscribeSchema.safeParse({ ...base, plz: "3000" }).success).toBe(false);
  });

  it("accepts a station instead of a postcode, and needs reminders or the digest", () => {
    expect(subscribeSchema.safeParse({ ...base, plz: null, stationId: "mrh-x", topics: ["mrh"] }).success).toBe(true);
    expect(subscribeSchema.safeParse({ ...base, reminders: false, digest: false }).success).toBe(false);
  });

  it("accepts a filled honeypot (the service drops it silently)", () => {
    expect(subscribeSchema.parse({ ...base, website: "http://spam" }).website).toBe("http://spam");
  });
});
