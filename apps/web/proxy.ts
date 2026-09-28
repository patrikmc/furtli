import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_PAGE, hasAccess, isOpenPath } from "@/lib/access";
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE_S, LANG_PARAM, isLang } from "@/lib/i18n/lang";

/**
 * 1. `?lang=de|en` on any page (e.g. links in English emails) stores the
 *    site language in the cookie (lib/i18n/lang.ts).
 * 2. Password gate for the whole site while it's for the close circle only
 * (see lib/access.ts). Off when SITE_PASSWORD is unset.
 * Pages redirect to /zugang; API calls get a 401.
 */
export async function proxy(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get(LANG_PARAM);
  const switchLang = isLang(lang) && req.cookies.get(LANG_COOKIE)?.value !== lang;
  // Also on this request, so the page renders in the new language right away.
  if (switchLang) req.cookies.set(LANG_COOKIE, lang);
  const res = await gate(req);
  if (switchLang) res.cookies.set(LANG_COOKIE, lang, { path: "/", maxAge: LANG_COOKIE_MAX_AGE_S, sameSite: "lax" });
  return res;
}

async function gate(req: NextRequest): Promise<NextResponse> {
  const password = process.env.SITE_PASSWORD;
  const { pathname, search } = req.nextUrl;
  if (!password || isOpenPath(pathname) || (await hasAccess(req, password))) {
    return NextResponse.next({ request: { headers: req.headers } });
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Password required" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const url = req.nextUrl.clone();
  url.pathname = ACCESS_PAGE;
  url.search = "";
  if (pathname !== "/" || search) url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Everything except build assets and public files (fonts, geo data, icons).
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|fonts/|geo/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|webmanifest|txt|geojson)$).*)"],
};
