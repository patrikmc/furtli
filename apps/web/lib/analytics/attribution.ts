/**
 * First-touch attribution for sign-ups: where did this visit come from?
 *
 * On the first page of a browser session we read the UTM tags from the URL
 * and the referring site, and keep them in sessionStorage (per tab, gone when
 * the tab closes, never sent anywhere by itself). When the visitor subscribes,
 * the form sends them along and they are stored on the subscriber row, so
 * "which Reel / Reddit post / QR card brought subscribers" is a simple query.
 */

export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  /** Referring host, e.g. "www.reddit.com". */
  referrer?: string;
  /** First page of the visit, path only. */
  landingPath?: string;
}

const STORAGE_KEY = "furtli.attribution";
const MAX = 100;

const UTM_KEYS: Record<string, keyof Attribution> = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_term: "utmTerm",
};

function clean(v: string | null | undefined): string | undefined {
  const t = v?.trim().slice(0, MAX);
  return t ? t : undefined;
}

/** Pure: attribution for a landing URL and document.referrer. Own-site referrers are ignored. */
export function parseAttribution(href: string, referrer: string): Attribution {
  const out: Attribution = {};
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return out;
  }
  for (const [param, key] of Object.entries(UTM_KEYS)) {
    const v = clean(url.searchParams.get(param));
    if (v) out[key] = v.toLowerCase();
  }
  if (referrer) {
    try {
      const r = new URL(referrer);
      if (r.hostname && r.hostname !== url.hostname) out.referrer = clean(r.hostname);
    } catch {
      // Ignore malformed referrers.
    }
  }
  out.landingPath = clean(url.pathname) ?? "/";
  return out;
}

/** Call once per page load (components/analytics/AttributionCapture.tsx). Keeps the first touch. */
export function captureAttribution(): void {
  try {
    if (window.sessionStorage.getItem(STORAGE_KEY)) return;
    const a = parseAttribution(window.location.href, document.referrer);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    // Storage blocked (private mode, embedded view): attribution is best effort.
  }
}

/** The stored first touch, or a fresh read of the current page if nothing is stored. */
export function readAttribution(): Attribution {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Attribution;
  } catch {
    // fall through
  }
  try {
    return parseAttribution(window.location.href, document.referrer);
  } catch {
    return {};
  }
}
