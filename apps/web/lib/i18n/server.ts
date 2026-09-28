import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, isLang, type Lang } from "./lang";

/** The visitor's site language (server components, route handlers): the cookie, else German. */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : DEFAULT_LANG;
}

/**
 * For pages opened from an email (confirm, unsubscribe): the visitor's own
 * choice if they have made one, otherwise the language of their emails.
 */
export async function getLangOr(fallback: Lang): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : fallback;
}
