/**
 * Site and email language. German is the default (the site is Zürich-first
 * and search engines see the German pages); English is chosen with the
 * DE/EN toggle, a `?lang=en` link (e.g. from an English email), or by
 * confirming an English subscription. The choice lives in one cookie.
 * No client/server-only imports here: used by the proxy, pages, components
 * and emails alike.
 */
export type Lang = "de" | "en";
export const LANGS: readonly Lang[] = ["de", "en"];
export const DEFAULT_LANG: Lang = "de";

/** Cookie holding the chosen site language ("de" | "en"). Not personal data; a year long. */
export const LANG_COOKIE = "furtli_lang";
export const LANG_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

/** Query parameter that switches the language (`?lang=en`); the proxy stores it in the cookie. */
export const LANG_PARAM = "lang";

export function asLang(v: unknown): Lang {
  return v === "en" ? "en" : "de";
}

export function isLang(v: unknown): v is Lang {
  return v === "de" || v === "en";
}

/** BCP 47 locale for dates and numbers. */
export const LOCALE: Record<Lang, string> = { de: "de-CH", en: "en-GB" };

/** `<html lang>` value. */
export const HTML_LANG: Record<Lang, string> = { de: "de-CH", en: "en" };
