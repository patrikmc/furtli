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
