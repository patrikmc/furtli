import { LOCALE, type Lang } from "./lang";

const noon = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  // Noon UTC is the same calendar day in Zürich all year round.
  return new Date(Date.UTC(y, m - 1, d, 12));
};

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(lang: Lang, key: string, opts: Intl.DateTimeFormatOptions) {
  const k = `${lang}|${key}`;
  let f = cache.get(k);
  if (!f) cache.set(k, (f = new Intl.DateTimeFormat(LOCALE[lang], { ...opts, timeZone: "Europe/Zurich" })));
  return f;
}

/** "Fr., 2. Oktober" / "Fri 2 October". */
export function formatDate(iso: string, lang: Lang = "de"): string {
  return fmt(lang, "date", { weekday: "short", day: "numeric", month: "long" }).format(noon(iso));
}

/** "Mi., 30.9." / "Wed 30/09". */
export function formatShortDate(iso: string, lang: Lang = "de"): string {
  return fmt(lang, "short", { weekday: "short", day: "numeric", month: "numeric" }).format(noon(iso));
}

/**
 * Opening times as published by the city are German ("15–19 Uhr",
 * "8 bis 11.30 Uhr"). In English they become "15:00–19:00", "8:00–11:30".
 */
export function localizeTimeText(text: string, lang: Lang): string {
  if (lang === "de") return text;
  const t = (h: string, m?: string) => `${Number(h)}:${m ?? "00"}`;
  return text
    .replace(/(\d{1,2})(?:[.:](\d{2}))?\s*(?:–|-|bis)\s*(\d{1,2})(?:[.:](\d{2}))?\s*Uhr/g, (_, h1, m1, h2, m2) => `${t(h1, m1)}–${t(h2, m2)}`)
    .replace(/\bUhr\b/g, "")
    .trim();
}
