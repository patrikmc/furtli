/**
 * Site password ("close circle only" access). Free replacement for Vercel's
 * paid Password Protection, enforced by proxy.ts.
 *
 *   SITE_PASSWORD unset  → no gate (local dev, tests, and the day we go public)
 *   SITE_PASSWORD set    → every page and API needs the access cookie, which
 *                          /zugang sets after the password is entered.
 *
 * The cookie holds an HMAC of the password, not the password. Changing
 * SITE_PASSWORD (and redeploying) logs everyone out.
 * Scripts (smoke test, CI) send the password in the `x-furtli-access` header.
 */

export const ACCESS_COOKIE = "furtli_access";
export const ACCESS_HEADER = "x-furtli-access";
export const ACCESS_MAX_AGE_S = 60 * 60 * 24 * 90; // 90 days
export const ACCESS_PAGE = "/zugang";

/**
 * Reachable without the password. Each is protected by something else or is
 * harmless: the gate itself, cron/ingest (CRON_SECRET), admin lookups (ADMIN_SECRET), and the email flows
 * (per-subscriber tokens; mail providers POST one-click unsubscribes without
 * cookies, RFC 8058).
 */
const OPEN_PATHS = [ACCESS_PAGE, "/api/zugang", "/api/cron", "/api/ingest", "/api/internal", "/api/email", "/abo"];

export function isOpenPath(pathname: string): boolean {
  return OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Where to go after logging in: only same-site paths, never back to the gate. */
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value === ACCESS_PAGE || value.startsWith(`${ACCESS_PAGE}?`) || value.startsWith("/api/zugang")) return "/";
  return value;
}

/** Cookie value for a password: hex HMAC-SHA256(password, fixed label). Web Crypto, so it runs in the proxy. */
export async function accessToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("furtli-access-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (no early exit on the first differing character). */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** True if the request carries the password header or a valid access cookie. */
export async function hasAccess(
  req: { headers: Headers; cookies: { get(name: string): { value: string } | undefined } },
  password: string,
): Promise<boolean> {
  const header = req.headers.get(ACCESS_HEADER);
  if (header !== null && safeEqual(header, password)) return true;
  const cookie = req.cookies.get(ACCESS_COOKIE)?.value;
  return cookie !== undefined && safeEqual(cookie, await accessToken(password));
}
