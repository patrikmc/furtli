import { z } from "zod";

import { CONSENT_TEXT, KERBSIDE_TOPICS, STATION_TOPICS, TOPICS, type Topic } from "./topics";

export { CONSENT_TEXT, KERBSIDE_TOPICS, STATION_TOPICS, TOPICS, type Topic };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const attributionSchema = z
  .object({
    utmSource: optionalText(100),
    utmMedium: optionalText(100),
    utmCampaign: optionalText(100),
    utmContent: optionalText(100),
    utmTerm: optionalText(100),
    referrer: optionalText(200),
    landingPath: optionalText(200),
  })
  .partial();

/** Body of POST /api/subscribe. */
export const subscribeSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    lang: z.enum(["de", "en"]).default("de"),
    plz: z
      .string()
      .regex(/^80\d{2}$/)
      .nullish()
      .transform((v) => v ?? null),
    stationId: z
      .string()
      .min(1)
      .max(120)
      .nullish()
      .transform((v) => v ?? null),
    topics: z.array(z.enum(TOPICS)).min(1).max(TOPICS.length),
    reminders: z.boolean().default(true),
    digest: z.boolean().default(false),
    consent: z.literal(true),
    /** Where the form was shown ("nearby", "station", …). */
    source: optionalText(40),
    attribution: attributionSchema.optional(),
    /** Honeypot: real people leave it empty. Accepted either way, so bots get the normal answer. */
    website: z.string().max(500).optional(),
  })
  .refine((v) => v.plz || v.stationId, { message: "plz or stationId is required", path: ["plz"] })
  .refine((v) => v.reminders || v.digest, { message: "choose reminders or the weekly overview", path: ["reminders"] })
  .transform((v) => ({ ...v, topics: [...new Set(v.topics)] }));

export type SubscribeInput = z.output<typeof subscribeSchema>;

/** Preferences as stored (and as held in pending_prefs until confirmed). */
export interface Prefs {
  lang: "de" | "en";
  plz: string | null;
  stationId: string | null;
  topics: Topic[];
  reminders: boolean;
  digest: boolean;
}

export function prefsFromInput(i: SubscribeInput): Prefs {
  return { lang: i.lang, plz: i.plz, stationId: i.stationId, topics: i.topics, reminders: i.reminders, digest: i.digest };
}
