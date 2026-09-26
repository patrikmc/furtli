import { describe, expect, it } from "vitest";
import { parseAttribution } from "./attribution";
import { UMAMI_BEFORE_SEND_FN, UMAMI_BEFORE_SEND_JS } from "./umami";

type Payload = { url?: string; referrer?: string; website?: string };

function beforeSend(): (type: string, p: Payload) => Payload {
  const w: Record<string, unknown> = {};
  new Function("window", UMAMI_BEFORE_SEND_JS)(w);
  return w[UMAMI_BEFORE_SEND_FN] as (type: string, p: Payload) => Payload;
}

describe("Umami before-send filter", () => {
  it("drops the tapped location but keeps UTM tags and area filters", () => {
    const p = beforeSend()("event", {
      url: "/?at=47.37350,8.52870&r=1000&utm_source=instagram&utm_campaign=reel-wasserkocher&plz=8004",
    });
    const params = new URLSearchParams(p.url!.split("?")[1]);
    expect(params.get("at")).toBeNull();
    expect(params.get("utm_source")).toBe("instagram");
    expect(params.get("utm_campaign")).toBe("reel-wasserkocher");
    expect(params.get("plz")).toBe("8004");
    expect(params.get("r")).toBe("1000");
  });

  it("removes the query entirely when nothing is allowed, and the hash", () => {
    expect(beforeSend()("pageview", { url: "/?at=1,2#x" }).url).toBe("/");
    expect(beforeSend()("pageview", { url: "/abholen" }).url).toBe("/abholen");
  });

  it("cuts referrers to origin and path", () => {
    const p = beforeSend()("pageview", { url: "/", referrer: "https://www.reddit.com/r/zurich/comments/abc?share=1" });
    expect(p.referrer).toBe("https://www.reddit.com/r/zurich/comments/abc");
  });

  it("never throws on odd payloads", () => {
    expect(beforeSend()("pageview", {})).toEqual({});
    expect(beforeSend()("pageview", { url: "/", referrer: "not a url" }).referrer).toBe("");
  });
});

describe("parseAttribution", () => {
  it("reads UTM tags (lower-cased), the external referrer host and the landing path", () => {
    expect(
      parseAttribution(
        "https://furtli.ch/?plz=8004&utm_source=QR-MRH-Stauffacher&utm_medium=print&utm_campaign=w3",
        "https://l.instagram.com/?u=x",
      ),
    ).toEqual({
      utmSource: "qr-mrh-stauffacher",
      utmMedium: "print",
      utmCampaign: "w3",
      referrer: "l.instagram.com",
      landingPath: "/",
    });
  });

  it("ignores own-site referrers and bad input", () => {
    expect(parseAttribution("https://furtli.ch/abholen", "https://furtli.ch/")).toEqual({ landingPath: "/abholen" });
    expect(parseAttribution("not a url", "")).toEqual({});
  });
});
