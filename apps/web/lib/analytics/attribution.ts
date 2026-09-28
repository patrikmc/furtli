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

/**
 * Call once per page load (components/analytics/AttributionCapture.tsx). Keeps
 * the first touch of this browser session. Returns it when it was captured
 * just now (a new visit), null when the session already had one.
 */
export function captureAttribution(): Attribution | null {
  try {
    if (window.sessionStorage.getItem(STORAGE_KEY)) return null;
    const a = parseAttribution(window.location.href, document.referrer);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    return a;
  } catch {
    // Storage blocked (private mode, embedded view): attribution is best effort.
    return null;
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

/**
 * Acquisition channel of a visit, from its UTM tags or, for untagged links,
 * the referring site. Same groups as utm_medium in the campaign registry,
 * plus search, direct and other (tagged, but with a medium we don't know).
 */
export type Channel = "email" | "social" | "community" | "search" | "print" | "paid" | "referral" | "direct" | "other";

const MEDIUM_CHANNEL: Record<string, Channel> = {
  email: "email",
  social: "social",
  community: "community",
  print: "print",
  paid: "paid",
  referral: "referral",
};
/** Sources our own emails use (lib/email/links.ts). */
const EMAIL_SOURCES = new Set(["reminder", "newsletter", "welcome"]);
const WEBMAIL = /(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com|mail\.yahoo\.com|mail\.proton\.me|bluewin\.ch|gmx\.net|gmx\.ch|web\.de)$/;
const SEARCH = /(^|\.)(google|bing|duckduckgo|ecosia|yahoo|qwant|startpage|yandex|baidu)\.[a-z.]+$|(^|\.)search\.brave\.com$/;
const SOCIAL = /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|tiktok\.com|t\.co|x\.com|twitter\.com|linkedin\.com|lnkd\.in|threads\.net|bsky\.app|youtube\.com|whatsapp\.com|wa\.me)$/;
const COMMUNITY = /(^|\.)(reddit\.com|nextdoor\.(com|ch))$/;

export function channelOf(a: { utmSource?: string | null; utmMedium?: string | null; referrer?: string | null }): Channel {
  const medium = a.utmMedium?.toLowerCase();
  if (medium && MEDIUM_CHANNEL[medium]) return MEDIUM_CHANNEL[medium];
  const source = a.utmSource?.toLowerCase();
  if (source) {
    if (EMAIL_SOURCES.has(source)) return "email";
    if (source.startsWith("qr-")) return "print";
    return "other";
  }
  const host = a.referrer?.toLowerCase();
  if (!host) return "direct";
  if (WEBMAIL.test(host)) return "email";
  if (SEARCH.test(host)) return "search";
  if (SOCIAL.test(host)) return "social";
  if (COMMUNITY.test(host)) return "community";
  return "referral";
}

/** Short acquisition fields for Umami events: channel, origin (utm_source or referring host) and post ID. */
export function acquisitionProps(a: Attribution): Record<string, string> {
  return {
    channel: channelOf(a),
    origin: a.utmSource ?? a.referrer ?? "direct",
    ...(a.utmContent ? { post: a.utmContent } : {}),
  };
}

/** Everything about a new visit's origin, for the "visit_source" event. */
export function visitSourceProps(a: Attribution): Record<string, string> {
  return {
    ...acquisitionProps(a),
    ...(a.utmMedium ? { medium: a.utmMedium } : {}),
    ...(a.utmCampaign ? { campaign: a.utmCampaign } : {}),
    ...(a.utmTerm ? { variant: a.utmTerm } : {}),
    ...(a.referrer ? { referrer: a.referrer } : {}),
    landing: a.landingPath ?? "/",
  };
}
