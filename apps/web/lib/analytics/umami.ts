import { acquisitionProps, readAttribution } from "./attribution";

/**
 * Umami (cookieless web analytics). The tracker script is only loaded when
 * NEXT_PUBLIC_UMAMI_WEBSITE_ID is set (see components/analytics/Analytics.tsx),
 * so local dev, tests and previews send nothing unless configured.
 *
 * Privacy: the map writes the tapped point into the URL (?at=lat,lng), which
 * can be someone's home. `UMAMI_BEFORE_SEND_JS` runs in the browser before
 * every Umami request and keeps only an allow-list of query parameters (the
 * UTM tags plus coarse area filters). Referrers are cut to origin + path.
 */

/** Name of the global callback passed to the tracker via data-before-send. */
export const UMAMI_BEFORE_SEND_FN = "furtliUmamiBeforeSend";

/** Query parameters that may reach Umami. Everything else is dropped. */
export const UMAMI_ALLOWED_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "plz",
  "kreis",
  "station",
  "scope",
  "r",
  "mat",
] as const;

/**
 * Plain ES5 so it can run as an inline script before the tracker loads.
 * Unit-tested by evaluating this exact string (lib/analytics/analytics.test.ts).
 */
export const UMAMI_BEFORE_SEND_JS = `window.${UMAMI_BEFORE_SEND_FN}=function(type,payload){try{var keep=${JSON.stringify(UMAMI_ALLOWED_PARAMS)};if(payload&&typeof payload.url==="string"){var h=payload.url.indexOf("#");var u=h>=0?payload.url.slice(0,h):payload.url;var q=u.indexOf("?");if(q>=0){var src=new URLSearchParams(u.slice(q+1));var out=new URLSearchParams();src.forEach(function(v,k){if(keep.indexOf(k)>=0)out.append(k,v)});var s=out.toString();u=u.slice(0,q)+(s?"?"+s:"")}payload.url=u}if(payload&&typeof payload.referrer==="string"&&payload.referrer){try{var r=new URL(payload.referrer);payload.referrer=r.origin+r.pathname}catch(e){payload.referrer=""}}}catch(e){}return payload};`;

/**
 * Attributes for the single Umami <script> tag (app/layout.tsx). One tag only:
 * a second copy would count every pageview twice and skip the privacy filter.
 *
 * data-performance="true" (tracker v3.1+) collects Core Web Vitals from real
 * visitors: LCP, INP, CLS, FCP, TTFB, shown in Umami → Performance (p50/p75/p95,
 * by page and by device/browser). The measurements go through the same
 * before-send filter (type "performance"), so ?at= is dropped from them too.
 * Caveat: the tracker closes a measurement on every URL change, and the map
 * rewrites the URL on each search / station tap, so on the map INP and CLS
 * cover only the stretch until the next interaction. LCP, FCP and TTFB are
 * unaffected; Vercel Speed Insights stays the reference for INP.
 */
export function umamiScriptAttrs(websiteId: string, domains?: string): Record<string, string> {
  return {
    "data-website-id": websiteId,
    "data-before-send": UMAMI_BEFORE_SEND_FN,
    "data-exclude-hash": "true",
    "data-performance": "true",
    // No automatic pageviews: the tracker would count one on every
    // history.replaceState, and the map rewrites the URL on each search and
    // station tap. <PageviewTracker> sends one per real path change instead.
    // Clicks on data-umami-event elements and Core Web Vitals still work.
    "data-auto-pageview": "false",
    ...(domains ? { "data-domains": domains } : {}),
  };
}

/**
 * Opt-out for your own devices: open any page once with `?umami=off` and this
 * browser stops being counted (Umami honours localStorage "umami.disabled").
 * `?umami=on` counts it again. Runs before the tracker loads, so the opt-out
 * visit itself is not counted either. The parameter never reaches Umami (it is
 * not on the allow-list above).
 */
export const UMAMI_OPT_OUT_JS = `try{var m=/[?&]umami=(off|on)(?:&|$)/.exec(window.location.search);if(m){if(m[1]==="off")window.localStorage.setItem("umami.disabled","1");else window.localStorage.removeItem("umami.disabled")}}catch(e){}`;

/**
 * Umami runs wherever a website id is configured: production, staging and
 * local dev alike (pre-launch, test visits are wanted). Tests and CI have no id,
 * so they send nothing. NEXT_PUBLIC_UMAMI_DOMAINS limits which hostnames count.
 */
export function umamiEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.NEXT_PUBLIC_UMAMI_WEBSITE_ID);
}

type UmamiData = Record<string, string | number | boolean>;
/** The payload Umami builds for a pageview (url, referrer, title, screen, …). */
type UmamiPayload = Record<string, unknown> & { url?: string; referrer?: string; title?: string };
type UmamiTracker = {
  track: {
    (event: string, data?: UmamiData): void;
    (build: (payload: UmamiPayload) => UmamiPayload): void;
  };
};

function tracker(): UmamiTracker | undefined {
  return (window as unknown as { umami?: UmamiTracker }).umami;
}

/**
 * Sends a custom event ("subscribe_submit", "station_open", …). A no-op when
 * the tracker isn't loaded (no website id, blocked by the browser, dev).
 * Event names are snake_case; keep the list in the README in sync.
 */
export function track(event: string, data?: UmamiData): void {
  try {
    tracker()?.track(event, data);
  } catch {
    // Analytics must never break the app.
  }
}

/**
 * Like track(), but waits (up to `timeoutMs`) for the tracker to load. For
 * events fired right at page load, before Umami's script has arrived.
 */
export function trackWhenReady(event: string, data?: UmamiData, timeoutMs = 10_000): void {
  whenReady(() => track(event, data), timeoutMs);
}

/** Runs `send` once the tracker has loaded (polls every 250 ms, gives up after `timeoutMs`). */
function whenReady(send: () => void, timeoutMs: number): void {
  const start = Date.now();
  const tick = () => {
    if (tracker()) return send();
    if (Date.now() - start < timeoutMs) window.setTimeout(tick, 250);
  };
  try {
    tick();
  } catch {
    // Analytics must never break the app.
  }
}

/**
 * One pageview for the current path (the tracker runs with
 * data-auto-pageview="false", see umamiScriptAttrs). `referrer` is the previous
 * in-app path on client-side navigation; the first view keeps the browser's
 * referrer. The URL still passes the before-send filter (?at= is dropped).
 */
export function trackPageview(previousPath?: string, timeoutMs = 10_000): void {
  whenReady(() => {
    try {
      const url = window.location.pathname + window.location.search;
      const referrer = previousPath ? window.location.origin + previousPath : undefined;
      tracker()?.track((p) => ({ ...p, url, title: document.title, ...(referrer ? { referrer } : {}) }));
    } catch {
      // Analytics must never break the app.
    }
  }, timeoutMs);
}

const sentOnce = new Set<string>();

/**
 * Sends an event at most once per page load per `key` (e.g. one client_error
 * per failing part). Waits for the tracker, since map_ready and load errors
 * can happen before Umami's script has arrived.
 */
export function trackOnce(key: string, event: string, data?: UmamiData): void {
  if (sentOnce.has(key)) return;
  sentOnce.add(key);
  trackWhenReady(event, data);
}

/** Tests only: forget what trackOnce sent. */
export function resetTrackOnce(): void {
  sentOnce.clear();
}

/** Parts of the app whose failure we count (`client_error.where`). */
export type ErrorWhere = "map_style" | "map_timeout" | "tiles" | "stations_api" | "calendar_api" | "subscribe_api";

/**
 * "client_error": something the visitor needed failed to load. `code` is an
 * HTTP status, "offline", "timeout" or "error", never a free-text message.
 * Once per page load and part, so one broken connection counts once.
 */
export function trackError(where: ErrorWhere, code: string | number = "error"): void {
  let c = code;
  try {
    if (c === "error" && typeof navigator !== "undefined" && navigator.onLine === false) c = "offline";
  } catch {
    // keep the code as given
  }
  trackOnce(`client_error:${where}`, "client_error", { where, code: String(c) });
}

/** HTTP status from an error message such as "Failed to load stations (503)", else "error". */
export function errorCode(e: unknown): string {
  const m = /\((\d{3})\)/.exec(String((e as { message?: unknown })?.message ?? e));
  return m ? m[1] : "error";
}

/** Coarse buckets read better in Umami's event-data report than raw numbers. */
export function countBucket(n: number): string {
  if (n <= 0) return "0";
  if (n <= 2) return "1-2";
  if (n <= 5) return "3-5";
  if (n <= 10) return "6-10";
  return "11+";
}

export function metersBucket(m: number): string {
  if (m <= 0) return "inside";
  if (m <= 300) return "0-300m";
  if (m <= 600) return "300-600m";
  if (m <= 1000) return "600m-1km";
  if (m <= 2000) return "1-2km";
  return "2km+";
}

export function msBucket(ms: number): string {
  if (ms < 1000) return "<1s";
  if (ms < 2000) return "1-2s";
  if (ms < 4000) return "2-4s";
  if (ms < 8000) return "4-8s";
  return "8s+";
}

/** Milliseconds since the page started loading (0 outside a browser). */
export function sinceLoadMs(): number {
  try {
    return Math.round(performance.now());
  } catch {
    return 0;
  }
}

/** What counts as "using the map" for the activation metric. */
export type FirstAction = "search_map" | "search_plz" | "search_kreis" | "search_gps" | "station" | "filter";

let firstActionSent = false;

/** Coarse time buckets read better in Umami's event-data report than raw seconds. */
export function secondsBucket(seconds: number): string {
  if (seconds < 10) return "0-9s";
  if (seconds < 30) return "10-29s";
  if (seconds < 60) return "30-59s";
  if (seconds < 180) return "1-3min";
  return "3min+";
}

/**
 * "first_action": the first meaningful map action of a page load (search,
 * station, filter), with the seconds since the page started loading. Sent
 * once per page load; visitors without it are the map's bounces.
 */
export function trackFirstAction(action: FirstAction, data: UmamiData = {}): void {
  if (firstActionSent) return;
  firstActionSent = true;
  let seconds = 0;
  try {
    seconds = Math.round(performance.now() / 1000);
  } catch {
    // performance is always there in browsers; keep 0 otherwise.
  }
  let acquisition: UmamiData = {};
  try {
    acquisition = acquisitionProps(readAttribution());
  } catch {
    // Outside a browser (tests): no attribution.
  }
  track("first_action", { action, seconds, within: secondsBucket(seconds), ...acquisition, ...data });
}

/** Tests only: allow first_action again. */
export function resetFirstAction(): void {
  firstActionSent = false;
}
