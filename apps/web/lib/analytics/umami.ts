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
] as const;

/**
 * Plain ES5 so it can run as an inline script before the tracker loads.
 * Unit-tested by evaluating this exact string (lib/analytics/analytics.test.ts).
 */
export const UMAMI_BEFORE_SEND_JS = `window.${UMAMI_BEFORE_SEND_FN}=function(type,payload){try{var keep=${JSON.stringify(UMAMI_ALLOWED_PARAMS)};if(payload&&typeof payload.url==="string"){var h=payload.url.indexOf("#");var u=h>=0?payload.url.slice(0,h):payload.url;var q=u.indexOf("?");if(q>=0){var src=new URLSearchParams(u.slice(q+1));var out=new URLSearchParams();src.forEach(function(v,k){if(keep.indexOf(k)>=0)out.append(k,v)});var s=out.toString();u=u.slice(0,q)+(s?"?"+s:"")}payload.url=u}if(payload&&typeof payload.referrer==="string"&&payload.referrer){try{var r=new URL(payload.referrer);payload.referrer=r.origin+r.pathname}catch(e){payload.referrer=""}}}catch(e){}return payload};`;

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
type UmamiTracker = { track: (event: string, data?: UmamiData) => void };

/**
 * Sends a custom event ("subscribe_submit", "station_open", …). A no-op when
 * the tracker isn't loaded (no website id, blocked by the browser, dev).
 * Event names are snake_case; keep the list in the README in sync.
 */
export function track(event: string, data?: UmamiData): void {
  try {
    (window as unknown as { umami?: UmamiTracker }).umami?.track(event, data);
  } catch {
    // Analytics must never break the app.
  }
}

/**
 * Like track(), but waits (up to `timeoutMs`) for the tracker to load. For
 * events fired right at page load, before Umami's script has arrived.
 */
export function trackWhenReady(event: string, data?: UmamiData, timeoutMs = 10_000): void {
  const start = Date.now();
  const tick = () => {
    if ((window as unknown as { umami?: UmamiTracker }).umami) return track(event, data);
    if (Date.now() - start < timeoutMs) window.setTimeout(tick, 250);
  };
  try {
    tick();
  } catch {
    // Analytics must never break the app.
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
