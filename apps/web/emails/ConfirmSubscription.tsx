import { COPY, type Lang } from "../lib/email/copy";
import type { SubscriptionSummary } from "../lib/email/types";
import { Summary } from "./components/Items";
import { C, H1, Layout, P, PrimaryButton } from "./components/Layout";

export interface ConfirmSubscriptionProps {
  lang: Lang;
  confirmUrl: string;
  mapUrl: string;
  summary: SubscriptionSummary;
  /** An active subscriber changing their settings. */
  isUpdate?: boolean;
}

/** Double opt-in: nothing is sent until this link is used (UWG Art. 3 lit. o). */
export default function ConfirmSubscription({ lang, confirmUrl, mapUrl, summary, isUpdate = false }: ConfirmSubscriptionProps) {
  const t = COPY[lang];
  return (
    <Layout lang={lang} preview={t.confirmPreview} mapUrl={mapUrl}>
      <H1>{t.confirmHeading}</H1>
      <P>{isUpdate ? t.confirmUpdateIntro : t.confirmIntro}</P>
      <Summary summary={summary} lang={lang} />
      <PrimaryButton href={confirmUrl} color={C.orange}>
        {t.confirmButton}
      </PrimaryButton>
      <P muted>{t.confirmIgnore}</P>
    </Layout>
  );
}

ConfirmSubscription.PreviewProps = {
  lang: "de",
  confirmUrl: "https://furtli.ch/abo/bestaetigen?t=preview",
  mapUrl: "https://furtli.ch/?plz=8004",
  summary: {
    targets: [
      { plz: "8004", stationName: null, topics: ["cardboard", "paper"] },
      { plz: null, stationName: "Stauffacher", topics: ["mrh"], change: "new" },
    ],
    reminders: true,
    digest: true,
  },
  isUpdate: true,
} satisfies ConfirmSubscriptionProps;
