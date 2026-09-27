import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_PAGE, hasAccess, isOpenPath } from "@/lib/access";

/**
 * Password gate for the whole site while it's for the close circle only
 * (see lib/access.ts). Off when SITE_PASSWORD is unset.
 * Pages redirect to /zugang; API calls get a 401.
 */
export async function proxy(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  const { pathname, search } = req.nextUrl;
  if (!password || isOpenPath(pathname) || (await hasAccess(req, password))) return NextResponse.next();

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
