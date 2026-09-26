/**
 * Subscription constants shared by the form (client) and the server.
 * No zod here, so the client bundle stays small.
 */
/** Collections a subscriber can be reminded of (= event types in the database). */
export const TOPICS = ["paper", "cardboard", "organic", "waste", "mrh", "hazmat"] as const;
export type Topic = (typeof TOPICS)[number];
export const KERBSIDE_TOPICS: readonly Topic[] = ["paper", "cardboard", "organic", "waste"];
export const STATION_TOPICS: readonly Topic[] = ["mrh", "hazmat"];

/**
 * The consent sentence next to the checkbox. Stored with the subscriber as
 * proof of what they agreed to; change the version suffix when you change it.
 */
export const CONSENT_TEXT = {
  de: "Ich möchte Erinnerungen an meine Entsorgungstermine per E-Mail erhalten. Abmelden geht jederzeit mit einem Klick. (v1)",
  en: "I'd like to get reminders of my collection dates by email. I can unsubscribe at any time with one click. (v1)",
} as const;
