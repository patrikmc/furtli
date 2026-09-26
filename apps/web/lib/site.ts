/**
 * Public base URL of the site, for links in emails. Set NEXT_PUBLIC_SITE_URL
 * in production (e.g. https://furtli.ch); on Vercel previews the deployment
 * URL is used; locally http://localhost:3000.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  const vercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
  return (explicit || vercel || "http://localhost:3000").replace(/\/+$/, "");
}
