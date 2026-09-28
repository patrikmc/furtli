import { COPY, type Lang } from "../lib/email/copy";
import type { EmailItem, SubscriptionSummary } from "../lib/email/types";
import { ItemCard, Summary } from "./components/Items";
import { H1, Layout, P, PrimaryButton } from "./components/Layout";

export interface WelcomeProps {
  lang: Lang;
  summary: SubscriptionSummary;
  /** The next few dates (up to ~4). */
  next: EmailItem[];
  mapUrl: string;
  unsubscribeUrl: string;
}

export default function Welcome({ lang, summary, next, mapUrl, unsubscribeUrl }: WelcomeProps) {
  const t = COPY[lang];
  return (
    <Layout lang={lang} preview={t.welcomePreview} mapUrl={mapUrl} unsubscribeUrl={unsubscribeUrl}>
      <H1>{t.welcomeHeading}</H1>
      <P>{t.welcomeIntro}</P>
      <Summary summary={summary} lang={lang} />
      <P>
        <strong>{t.welcomeNext}</strong>
      </P>
      {next.length ? (
        next.map((it) => <ItemCard key={`${it.type}-${it.date}-${it.stationId ?? ""}`} item={it} lang={lang} showDate hint={false} />)
      ) : (
        <P muted>{t.welcomeNoDates}</P>
      )}
      <PrimaryButton href={mapUrl}>{t.openMap}</PrimaryButton>
      <P muted>{t.welcomeShare}</P>
    </Layout>
  );
}

Welcome.PreviewProps = {
  lang: "de",
  summary: { targets: [{ plz: "8004", stationName: null, topics: ["cardboard", "paper", "mrh"] }], reminders: true, digest: false },
  next: [
    { type: "cardboard", date: "2026-10-28" },
    { type: "mrh", date: "2026-10-30", stationName: "Stauffacher", address: "St. Jakobstrasse 29", time: "15–19 Uhr" },
    { type: "paper", date: "2026-11-04" },
  ],
  mapUrl: "https://furtli.ch/?plz=8004&utm_source=welcome&utm_medium=email&utm_campaign=welcome",
  unsubscribeUrl: "https://furtli.ch/abo/abmelden?t=preview",
} satisfies WelcomeProps;
