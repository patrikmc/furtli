import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, ACCESS_MAX_AGE_S, ACCESS_PAGE, accessToken, safeEqual, safeNext } from "@/lib/access";

export const dynamic = "force-dynamic";

/** POST /api/zugang (form from /zugang): checks the site password, sets the access cookie. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const next = safeNext(form.get("next"));
  const password = process.env.SITE_PASSWORD;
  const given = form.get("password");

  if (!password) return redirect(req, next);

  if (typeof given !== "string" || !safeEqual(given, password)) {
    await new Promise((r) => setTimeout(r, 500)); // slows down guessing
    const url = new URL(ACCESS_PAGE, req.url);
    url.searchParams.set("fehler", "1");
    if (next !== "/") url.searchParams.set("next", next);
    return redirect(req, url.pathname + url.search);
  }

  const res = redirect(req, next);
  res.headers.append(
    "Set-Cookie",
    [
      `${ACCESS_COOKIE}=${await accessToken(password)}`,
      "Path=/",
      `Max-Age=${ACCESS_MAX_AGE_S}`,
      "HttpOnly",
      "SameSite=Lax",
      ...(req.nextUrl.protocol === "https:" ? ["Secure"] : []),
    ].join("; "),
  );
  return res;
}

function redirect(req: NextRequest, path: string) {
  return new Response(null, { status: 303, headers: { Location: new URL(path, req.url).toString(), "Cache-Control": "no-store" } });
}
