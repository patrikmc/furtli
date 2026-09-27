// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";
import { ACCESS_COOKIE, ACCESS_HEADER, accessToken, isOpenPath, safeEqual, safeNext } from "./access";

describe("isOpenPath", () => {
  it.each(["/zugang", "/api/zugang", "/api/cron/emails", "/api/ingest", "/api/email/unsubscribe", "/abo/bestaetigen"])(
    "%s is open",
    (p) => expect(isOpenPath(p)).toBe(true),
  );
  it.each(["/", "/api/stations", "/api/calendar", "/abholen", "/datenschutz", "/zugangx", "/api/cronjob"])(
    "%s is gated",
    (p) => expect(isOpenPath(p)).toBe(false),
  );
});

describe("safeNext", () => {
  it("keeps same-site paths", () => expect(safeNext("/?plz=8004")).toBe("/?plz=8004"));
  it.each([undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", "/zugang", "/zugang?next=/"])(
    "falls back to / for %s",
    (v) => expect(safeNext(v)).toBe("/"),
  );
});

describe("accessToken / safeEqual", () => {
  it("is stable per password and differs between passwords", async () => {
    expect(await accessToken("a")).toBe(await accessToken("a"));
    expect(await accessToken("a")).not.toBe(await accessToken("b"));
    expect(await accessToken("a")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("compares strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("proxy", () => {
  afterEach(() => vi.unstubAllEnvs());
  const req = (path: string, init?: { headers?: Record<string, string> }) =>
    new NextRequest(new URL(path, "https://furtli.ch"), init);
  const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

  it("lets everything through without SITE_PASSWORD", async () => {
    vi.stubEnv("SITE_PASSWORD", "");
    expect(passes(await proxy(req("/")))).toBe(true);
  });

  describe("with SITE_PASSWORD", () => {
    it("redirects pages to /zugang, keeping the target", async () => {
      vi.stubEnv("SITE_PASSWORD", "geheim");
      const res = await proxy(req("/?plz=8004"));
      expect(res.status).toBe(307);
      const loc = new URL(res.headers.get("location")!);
      expect(loc.pathname).toBe("/zugang");
      expect(loc.searchParams.get("next")).toBe("/?plz=8004");
    });
    it("answers API calls with 401", async () => {
      vi.stubEnv("SITE_PASSWORD", "geheim");
      expect((await proxy(req("/api/stations"))).status).toBe(401);
    });
    it("accepts the access cookie", async () => {
      vi.stubEnv("SITE_PASSWORD", "geheim");
      const cookie = `${ACCESS_COOKIE}=${await accessToken("geheim")}`;
      expect(passes(await proxy(req("/", { headers: { cookie } })))).toBe(true);
    });
    it("rejects a cookie made for another password", async () => {
      vi.stubEnv("SITE_PASSWORD", "geheim");
      const cookie = `${ACCESS_COOKIE}=${await accessToken("alt")}`;
      expect((await proxy(req("/api/stations", { headers: { cookie } }))).status).toBe(401);
    });
    it("accepts the password header (scripts)", async () => {
      vi.stubEnv("SITE_PASSWORD", "geheim");
      expect(passes(await proxy(req("/api/stations", { headers: { [ACCESS_HEADER]: "geheim" } })))).toBe(true);
    });
    it("leaves cron and email endpoints open", async () => {
      vi.stubEnv("SITE_PASSWORD", "geheim");
      expect(passes(await proxy(req("/api/cron/emails")))).toBe(true);
      expect(passes(await proxy(req("/api/email/unsubscribe?t=x")))).toBe(true);
    });
  });
});
