import type { EventTypeValue } from "db/schema";

/**
 * All email wording in one place, German (informal "du") and English.
 * Keep sentences short; one dialect word per email at most (brand rules, doc 04).
 */
export type Lang = "de" | "en";
export const LANGS: readonly Lang[] = ["de", "en"];

export function asLang(v: unknown): Lang {
  return v === "en" ? "en" : "de";
}

export const TYPE_LABELS: Record<Lang, Record<EventTypeValue, string>> = {
  de: {
    paper: "Papier",
    cardboard: "Karton",
    organic: "Bioabfall",
    waste: "Kehricht",
    mrh: "Mobiler Recyclinghof",
    hazmat: "Sonderabfallmobil",
  },
  en: {
    paper: "Paper",
    cardboard: "Cardboard",
    organic: "Organic waste",
    waste: "Household waste",
    mrh: "Mobile recycling point",
    hazmat: "Hazardous waste collection",
  },
};

/**
 * Short hint shown under a reminder item. Check against stadt-zuerich.ch
 * before launch (collection rules change now and then).
 */
export const TYPE_HINTS: Record<Lang, Partial<Record<EventTypeValue, string>>> = {
  de: {
    paper: "Gebündelt am Abfuhrtag bis 7 Uhr an den Strassenrand stellen.",
    cardboard: "Flach gefaltet und gebündelt am Abfuhrtag bis 7 Uhr bereitstellen.",
    organic: "Grüncontainer am Abfuhrtag bis 7 Uhr bereitstellen.",
    waste: "Züri-Säcke am Abfuhrtag bis 7 Uhr bereitstellen.",
    mrh: "Gratis für Sperrgut, Metall, Elektrogeräte, Kork und Alu-Kapseln. Max. 40 kg und 2,5 m pro Stück.",
    hazmat: "Farben, Lacke, Chemikalien und andere Sonderabfälle aus dem Haushalt, in Haushaltsmengen.",
  },
  en: {
    paper: "Tie it in bundles and put it out by 7 am on collection day.",
    cardboard: "Fold it flat, tie it up and put it out by 7 am on collection day.",
    organic: "Put the green bin out by 7 am on collection day.",
    waste: "Put your Züri-Säcke out by 7 am on collection day.",
    mrh: "Free for bulky items, metal, electronics, cork and aluminium capsules. Max 40 kg and 2.5 m per piece.",
    hazmat: "Paint, varnish, chemicals and other hazardous household waste, in household quantities.",
  },
};

export const COPY = {
  de: {
    brandTagline: "Recycling in Zürich, auf einer Karte.",
    footerWhy: "Du bekommst diese E-Mail, weil du dich auf furtli.ch für Erinnerungen angemeldet hast.",
    footerUnsubscribe: "Abmelden",
    footerMap: "Zur Karte",
    // confirm
    confirmSubject: "Bitte bestätige deine Erinnerungen",
    confirmUpdateSubject: "Bitte bestätige deine neuen Einstellungen",
    confirmPreview: "Ein Klick, dann erinnern wir dich an deine Termine.",
    confirmHeading: "Fast geschafft",
    confirmIntro: "Bitte bestätige, dass du diese Erinnerungen per E-Mail bekommen möchtest:",
    confirmUpdateIntro: "Du hast deine Erinnerungen ergänzt. So sieht dein Abo nach der Bestätigung aus:",
    confirmButton: "Ja, erinnere mich",
    confirmIgnore: "Du hast dich nicht angemeldet? Dann ignoriere diese E-Mail einfach. Ohne Bestätigung schicken wir nichts.",
    // welcome
    welcomeSubject: "Du bist dabei: deine Erinnerungen sind aktiv",
    welcomePreview: "Wir melden uns jeweils am Vorabend.",
    welcomeHeading: "Du bist dabei",
    welcomeIntro: "Wir schreiben dir jeweils am Vorabend. Das hast du gewählt:",
    welcomeNext: "Deine nächsten Termine",
    welcomeNoDates: "Für die nächsten Wochen sind noch keine Termine publiziert. Wir melden uns, sobald es so weit ist.",
    welcomeShare: "Wohnst du in einer WG oder einem Mehrfamilienhaus? Leite diese E-Mail weiter, dann verpasst niemand mehr den Karton-Tag.",
    // reminder
    reminderSubject: (items: string) => `Morgen: ${items}`,
    reminderPreview: "Kurze Erinnerung für morgen.",
    reminderHeading: (date: string) => `Morgen, ${date}`,
    reminderPickup: "Keine Zeit oder zu schwer? Wir bringen's hin",
    // digest
    digestSubject: (range: string) => `Deine Woche: ${range}`,
    digestPreview: "Alle Termine der kommenden Woche auf einen Blick.",
    digestHeading: "Deine Woche",
    digestIntro: "Das steht in den nächsten sieben Tagen an:",
    digestEmpty: "Diese Woche steht nichts an. Geniess die Ruhe.",
    // shared
    summaryPlz: (plz: string) => `Postleitzahl ${plz}`,
    summaryStation: (name: string) => `Standort: ${name}`,
    summaryTarget: (where: string, topics: string) => `${where}: ${topics}`,
    summaryNew: "neu",
    summaryChanged: "geändert",
    summaryReminders: "E-Mail am Vorabend",
    whyHeading: "Dein Abo",
    whyIntro: "Du bekommst diese E-Mail, weil du Folgendes abonniert hast:",
    summaryDigest: "Wochenübersicht am Sonntagabend",
    openMap: "Auf der Karte ansehen",
  },
  en: {
    brandTagline: "Recycling in Zurich, on one map.",
    footerWhy: "You're getting this email because you signed up for reminders on furtli.ch.",
    footerUnsubscribe: "Unsubscribe",
    footerMap: "Open the map",
    confirmSubject: "Please confirm your reminders",
    confirmUpdateSubject: "Please confirm your new settings",
    confirmPreview: "One click and we'll remind you of your dates.",
    confirmHeading: "Almost done",
    confirmIntro: "Please confirm that you'd like to get these reminders by email:",
    confirmUpdateIntro: "You added to your reminders. This is your subscription once you confirm:",
    confirmButton: "Yes, remind me",
    confirmIgnore: "Didn't sign up? Just ignore this email. We send nothing without your confirmation.",
    welcomeSubject: "You're in: your reminders are on",
    welcomePreview: "We'll email you the evening before.",
    welcomeHeading: "You're in",
    welcomeIntro: "We'll email you the evening before. Here's what you chose:",
    welcomeNext: "Your next dates",
    welcomeNoDates: "No dates have been published for the coming weeks yet. We'll email you once they are.",
    welcomeShare: "Living in a shared flat or a bigger building? Forward this email so nobody misses cardboard day again.",
    reminderSubject: (items: string) => `Tomorrow: ${items}`,
    reminderPreview: "A quick reminder for tomorrow.",
    reminderHeading: (date: string) => `Tomorrow, ${date}`,
    reminderPickup: "No time, or too heavy? We'll take it there for you",
    digestSubject: (range: string) => `Your week: ${range}`,
    digestPreview: "All dates for the coming week at a glance.",
    digestHeading: "Your week",
    digestIntro: "Here's what's coming up in the next seven days:",
    digestEmpty: "Nothing this week. Enjoy the quiet.",
    summaryPlz: (plz: string) => `Postcode ${plz}`,
    summaryStation: (name: string) => `Location: ${name}`,
    summaryTarget: (where: string, topics: string) => `${where}: ${topics}`,
    summaryNew: "new",
    summaryChanged: "changed",
    summaryReminders: "Email the evening before",
    whyHeading: "Your subscription",
    whyIntro: "You're getting this email because you subscribed to:",
    summaryDigest: "Weekly overview on Sunday evening",
    openMap: "See it on the map",
  },
} as const;

export type Copy = (typeof COPY)[Lang];

const LOCALE: Record<Lang, string> = { de: "de-CH", en: "en-GB" };

/** "Dienstag, 27. Oktober" / "Tuesday 27 October" for an ISO date. */
export function formatLongDate(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE[lang], {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Zurich",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "Mo, 26.10." / "Mon 26/10". */
export function formatShortDate(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE[lang], {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    timeZone: "Europe/Zurich",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "Karton, Papier und Mobiler Recyclinghof". */
export function joinList(parts: string[], lang: Lang): string {
  return new Intl.ListFormat(LOCALE[lang], { style: "long", type: "conjunction" }).format(parts);
}
