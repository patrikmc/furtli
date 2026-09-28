import { COPY, formatLongDate, type Lang } from "../lib/email/copy";
import type { EmailItem, SubscriptionSummary } from "../lib/email/types";
import { ItemCard, WhyYouGetThis } from "./components/Items";
import { C, H1, Layout, PrimaryButton } from "./components/Layout";

export interface ReminderProps {
  lang: Lang;
  /** The collection day (tomorrow when sent). */
  date: string;
  items: EmailItem[];
  /** Everything they follow, shown at the bottom ("why you get this"). */
  summary: SubscriptionSummary;
  mapUrl: string;
  /** Set when an item is a Mobile Recyclinghof: link to the pickup offer (funnel 4c). */
  pickupUrl?: string | null;
  unsubscribeUrl: string;
}

/** Sent the evening before one or more collections. One email per day, all items together. */
export default function Reminder({ lang, date, items, summary, mapUrl, pickupUrl, unsubscribeUrl }: ReminderProps) {
  const t = COPY[lang];
  return (
    <Layout lang={lang} preview={t.reminderPreview} mapUrl={mapUrl} unsubscribeUrl={unsubscribeUrl}>
      <H1>{t.reminderHeading(formatLongDate(date, lang))}</H1>
      {items.map((it) => (
        <ItemCard key={`${it.type}-${it.stationId ?? ""}`} item={it} lang={lang} />
      ))}
      <PrimaryButton href={mapUrl}>{t.openMap}</PrimaryButton>
      {pickupUrl && (
        <>
          {" "}
          <PrimaryButton href={pickupUrl} color={C.orange}>
            {t.reminderPickup}
          </PrimaryButton>
        </>
      )}
      <WhyYouGetThis summary={summary} lang={lang} />
    </Layout>
  );
}

Reminder.PreviewProps = {
  lang: "de",
  date: "2026-10-30",
  items: [
    { type: "cardboard", date: "2026-10-30" },
    { type: "mrh", date: "2026-10-30", stationId: "mrh-stauffacher", stationName: "Stauffacher", address: "St. Jakobstrasse 29", time: "15–19 Uhr" },
  ],
  summary: {
    targets: [
      { plz: "8004", stationName: null, topics: ["cardboard", "paper", "mrh"] },
      { plz: null, stationName: "Stauffacher", topics: ["mrh"] },
    ],
    reminders: true,
    digest: true,
  },
  mapUrl: "https://furtli.ch/?plz=8004&utm_source=reminder&utm_medium=email&utm_campaign=reminder",
  pickupUrl: "https://furtli.ch/abholen?station=mrh-stauffacher&utm_source=reminder&utm_medium=email&utm_campaign=reminder",
  unsubscribeUrl: "https://furtli.ch/abo/abmelden?t=preview",
} satisfies ReminderProps;
