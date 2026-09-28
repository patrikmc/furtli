import { Text } from "@react-email/components";
import { COPY, formatLongDate, type Lang } from "../lib/email/copy";
import type { EmailItem, SubscriptionSummary } from "../lib/email/types";
import { ItemCard, WhyYouGetThis } from "./components/Items";
import { C, H1, Layout, P, PrimaryButton } from "./components/Layout";

export interface WeeklyDigestProps {
  lang: Lang;
  days: { date: string; items: EmailItem[] }[];
  /** Everything they follow, shown at the bottom ("why you get this"). */
  summary: SubscriptionSummary;
  mapUrl: string;
  pickupUrl?: string | null;
  unsubscribeUrl: string;
}

/** Sunday evening: the next seven days, grouped by day. */
export default function WeeklyDigest({ lang, days, summary, mapUrl, pickupUrl, unsubscribeUrl }: WeeklyDigestProps) {
  const t = COPY[lang];
  return (
    <Layout lang={lang} preview={t.digestPreview} mapUrl={mapUrl} unsubscribeUrl={unsubscribeUrl}>
      <H1>{t.digestHeading}</H1>
      {days.length === 0 ? (
        <P>{t.digestEmpty}</P>
      ) : (
        <>
          <P>{t.digestIntro}</P>
          {days.map((d) => (
            <div key={d.date}>
              <Text style={{ fontSize: 14, fontWeight: 700, color: C.muted, margin: "14px 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {formatLongDate(d.date, lang)}
              </Text>
              {d.items.map((it) => (
                <ItemCard key={`${it.type}-${it.stationId ?? ""}`} item={it} lang={lang} hint={false} />
              ))}
            </div>
          ))}
        </>
      )}
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

WeeklyDigest.PreviewProps = {
  lang: "de",
  days: [
    { date: "2026-10-27", items: [{ type: "mrh", date: "2026-10-27", stationName: "Stauffacher", address: "St. Jakobstrasse 29", time: "15–19 Uhr" }] },
    { date: "2026-10-28", items: [{ type: "cardboard", date: "2026-10-28" }, { type: "organic", date: "2026-10-28" }] },
    { date: "2026-10-30", items: [{ type: "mrh", date: "2026-10-30", stationName: "Stauffacher", address: "St. Jakobstrasse 29", time: "15–19 Uhr" }] },
  ],
  summary: {
    targets: [
      { plz: "8004", stationName: null, topics: ["cardboard", "paper", "mrh"] },
      { plz: null, stationName: "Stauffacher", topics: ["mrh"] },
    ],
    reminders: true,
    digest: true,
  },
  mapUrl: "https://furtli.ch/?plz=8004&utm_source=newsletter&utm_medium=email&utm_campaign=digest",
  pickupUrl: null,
  unsubscribeUrl: "https://furtli.ch/abo/abmelden?t=preview",
} satisfies WeeklyDigestProps;
