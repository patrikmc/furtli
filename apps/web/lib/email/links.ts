import { siteUrl } from "@/lib/site";

/**
 * Links in emails. Every link back to the site carries UTM tags, so Umami
 * shows visits from emails as their own source:
 *   utm_source = reminder | newsletter | welcome, utm_medium = email,
 *   utm_campaign = the email kind (and date for reminders/digests).
 * Confirm and unsubscribe links carry no UTM tags (they are not marketing).
 */
export type EmailCampaign = "reminder" | "digest" | "welcome";

const SOURCE: Record<EmailCampaign, string> = { reminder: "reminder", digest: "newsletter", welcome: "welcome" };

export function trackedUrl(path: string, campaign: EmailCampaign, content?: string): string {
  const url = new URL(path, siteUrl() + "/");
  url.searchParams.set("utm_source", SOURCE[campaign]);
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", campaign);
  if (content) url.searchParams.set("utm_content", content);
  return url.toString();
}

/** Map for a postcode or a station, whichever the subscription is about. */
export function mapPath(opts: { plz?: string | null; stationId?: string | null }): string {
  if (opts.stationId) return `/?station=${encodeURIComponent(opts.stationId)}`;
  if (opts.plz) return `/?plz=${encodeURIComponent(opts.plz)}`;
  return "/";
}

export function confirmPageUrl(token: string): string {
  return `${siteUrl()}/abo/bestaetigen?t=${encodeURIComponent(token)}`;
}

/** Page with an "Abmelden" button (footer link; safe against link scanners). */
export function unsubscribePageUrl(token: string): string {
  return `${siteUrl()}/abo/abmelden?t=${encodeURIComponent(token)}`;
}

/** RFC 8058 one-click endpoint for the List-Unsubscribe header (mail clients POST to it). */
export function oneClickUnsubscribeUrl(token: string): string {
  return `${siteUrl()}/api/email/unsubscribe?t=${encodeURIComponent(token)}`;
}

/** Headers that give Gmail/Apple Mail a native "Unsubscribe" button. */
export function listUnsubscribeHeaders(token: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${oneClickUnsubscribeUrl(token)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
