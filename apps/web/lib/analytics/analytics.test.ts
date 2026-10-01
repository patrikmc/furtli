import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquisitionProps, channelOf, parseAttribution, visitSourceProps } from "./attribution";
import {
  UMAMI_BEFORE_SEND_FN,
  UMAMI_BEFORE_SEND_JS,
  UMAMI_OPT_OUT_JS,
  countBucket,
  errorCode,
  metersBucket,
  msBucket,
  resetTrackOnce,
  trackError,
  trackOnce,
  trackPageview,
  umamiEnabled,
  umamiScriptAttrs,
} from "./umami";

type Payload = { url?: string; referrer?: string; website?: string; [metric: string]: unknown };

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

  it("also filters Core Web Vitals payloads (type performance) and keeps the metrics", () => {
    const p = beforeSend()("performance", {
      url: "/?at=47.37350,8.52870&station=mrh-12",
      lcp: 1840,
      inp: 96,
      cls: 0.02,
    } as Payload);
    expect(p.url).toBe("/?station=mrh-12");
    expect(p).toMatchObject({ lcp: 1840, inp: 96, cls: 0.02 });
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

describe("Umami opt-out (?umami=off)", () => {
  function run(search: string, stored: Record<string, string> = {}) {
    const store = { ...stored };
    const w = {
      location: { search },
      localStorage: {
        setItem: (k: string, v: string) => (store[k] = v),
        removeItem: (k: string) => delete store[k],
      },
    };
    new Function("window", UMAMI_OPT_OUT_JS)(w);
    return store;
  }

  it("disables this browser with ?umami=off and re-enables with ?umami=on", () => {
    expect(run("?plz=8004&umami=off")).toEqual({ "umami.disabled": "1" });
    expect(run("?umami=on", { "umami.disabled": "1" })).toEqual({});
  });

  it("leaves other visits alone and never throws", () => {
    expect(run("?utm_source=instagram", { keep: "x" })).toEqual({ keep: "x" });
    expect(run("?umami=offline")).toEqual({});
    expect(() => new Function("window", UMAMI_OPT_OUT_JS)({})).not.toThrow();
  });
});

describe("umamiScriptAttrs", () => {
  it("turns on Core Web Vitals and keeps the privacy filter on the one tracker tag", () => {
    const a = umamiScriptAttrs("abc");
    expect(a["data-website-id"]).toBe("abc");
    expect(a["data-performance"]).toBe("true");
    expect(a["data-before-send"]).toBe(UMAMI_BEFORE_SEND_FN);
    expect(a["data-exclude-hash"]).toBe("true");
    // Pageviews are sent by <PageviewTracker>, not on every replaceState.
    expect(a["data-auto-pageview"]).toBe("false");
    expect(a).not.toHaveProperty("data-domains");
  });
  it("limits hostnames when domains are set", () => {
    expect(umamiScriptAttrs("abc", "furtli.ch,www.furtli.ch")["data-domains"]).toBe("furtli.ch,www.furtli.ch");
  });
});

describe("umamiEnabled", () => {
  const id = { NEXT_PUBLIC_UMAMI_WEBSITE_ID: "abc" };
  it("is on in every environment that has a website id", () => {
    expect(umamiEnabled({ ...id, APP_ENV: "production" })).toBe(true);
    expect(umamiEnabled({ ...id, APP_ENV: "staging" })).toBe(true);
    expect(umamiEnabled({ ...id })).toBe(true);
  });
  it("is off without a website id (tests, CI)", () => {
    expect(umamiEnabled({ APP_ENV: "production" })).toBe(false);
    expect(umamiEnabled({})).toBe(false);
  });
});

describe("channelOf", () => {
  it("uses utm_medium when it is one of ours", () => {
    expect(channelOf({ utmSource: "reddit", utmMedium: "community" })).toBe("community");
    expect(channelOf({ utmSource: "qr-mrh-stauffacher", utmMedium: "print" })).toBe("print");
    expect(channelOf({ utmSource: "meta-ads", utmMedium: "paid" })).toBe("paid");
  });

  it("recognises our own emails and QR codes without a known medium", () => {
    expect(channelOf({ utmSource: "reminder", utmMedium: "email" })).toBe("email");
    expect(channelOf({ utmSource: "newsletter" })).toBe("email");
    expect(channelOf({ utmSource: "qr-repaircafe" })).toBe("print");
    expect(channelOf({ utmSource: "something", utmMedium: "banner" })).toBe("other");
  });

  it("classifies untagged visits by the referring site", () => {
    expect(channelOf({ referrer: "www.google.ch" })).toBe("search");
    expect(channelOf({ referrer: "duckduckgo.com" })).toBe("search");
    expect(channelOf({ referrer: "search.brave.com" })).toBe("search");
    expect(channelOf({ referrer: "l.instagram.com" })).toBe("social");
    expect(channelOf({ referrer: "lm.facebook.com" })).toBe("social");
    expect(channelOf({ referrer: "t.co" })).toBe("social");
    expect(channelOf({ referrer: "www.reddit.com" })).toBe("community");
    expect(channelOf({ referrer: "mail.google.com" })).toBe("email");
    expect(channelOf({ referrer: "outlook.live.com" })).toBe("email");
    expect(channelOf({ referrer: "www.tsri.ch" })).toBe("referral");
    expect(channelOf({})).toBe("direct");
  });
});

describe("acquisition event fields", () => {
  const a = {
    utmSource: "reddit",
    utmMedium: "community",
    utmCampaign: "w2-launch",
    utmContent: "p08-reddit-launch",
    landingPath: "/",
  };
  it("gives a short version for events and a full one for visit_source", () => {
    expect(acquisitionProps(a)).toEqual({ channel: "community", origin: "reddit", post: "p08-reddit-launch" });
    expect(visitSourceProps(a)).toEqual({
      channel: "community",
      origin: "reddit",
      post: "p08-reddit-launch",
      medium: "community",
      campaign: "w2-launch",
      landing: "/",
    });
    expect(visitSourceProps({ referrer: "www.google.ch", landingPath: "/abholen" })).toEqual({
      channel: "search",
      origin: "www.google.ch",
      referrer: "www.google.ch",
      landing: "/abholen",
    });
  });
});

describe("buckets", () => {
  it("groups result counts", () => {
    expect([0, 1, 2, 3, 5, 6, 10, 11, 40].map(countBucket)).toEqual(["0", "1-2", "1-2", "3-5", "3-5", "6-10", "6-10", "11+", "11+"]);
  });
  it("groups distances (0 = inside the searched area)", () => {
    expect([0, 120, 300, 450, 900, 1500, 2600].map(metersBucket)).toEqual([
      "inside",
      "0-300m",
      "0-300m",
      "300-600m",
      "600m-1km",
      "1-2km",
      "2km+",
    ]);
  });
  it("groups load times", () => {
    expect([400, 1000, 2500, 5000, 9000].map(msBucket)).toEqual(["<1s", "1-2s", "2-4s", "4-8s", "8s+"]);
  });
});

describe("errorCode", () => {
  it("takes the HTTP status from our error messages, never the free text", () => {
    expect(errorCode(new Error("Failed to load stations (503)"))).toBe("503");
    expect(errorCode("Subscribe failed (429)")).toBe("429");
    expect(errorCode(new TypeError("NetworkError when attempting to fetch resource."))).toBe("error");
  });
});

describe("tracker calls", () => {
  const sent: unknown[][] = [];
  beforeEach(() => {
    sent.length = 0;
    resetTrackOnce();
    vi.stubGlobal("umami", {
      track: (e: unknown, d?: unknown) =>
        sent.push(typeof e === "function" ? ["$pageview", e({ url: "/ignored", referrer: "https://www.google.com/" })] : [e, d]),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("trackOnce sends an event once per key", () => {
    trackOnce("map_ready", "map_ready", { ms: 800 });
    trackOnce("map_ready", "map_ready", { ms: 900 });
    expect(sent).toEqual([["map_ready", { ms: 800 }]]);
  });

  it("trackError sends one client_error per part with a code, never a message", () => {
    trackError("stations_api", 503);
    trackError("stations_api", 500);
    trackError("calendar_api");
    expect(sent).toEqual([
      ["client_error", { where: "stations_api", code: "503" }],
      ["client_error", { where: "calendar_api", code: "error" }],
    ]);
  });

  it("trackPageview sends the current path, and the previous path as referrer on in-app navigation", () => {
    window.history.replaceState(null, "", "/datenschutz?utm_source=reddit");
    trackPageview();
    trackPageview("/");
    expect(sent[0]).toEqual(["$pageview", expect.objectContaining({ url: "/datenschutz?utm_source=reddit", referrer: "https://www.google.com/" })]);
    expect(sent[1]).toEqual(["$pageview", expect.objectContaining({ url: "/datenschutz?utm_source=reddit", referrer: `${window.location.origin}/` })]);
  });
});
