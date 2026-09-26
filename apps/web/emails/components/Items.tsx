import { Section, Text } from "@react-email/components";
import { TYPE_HINTS, TYPE_LABELS, formatShortDate, type Lang } from "../../lib/email/copy";
import type { EmailItem, SubscriptionSummary } from "../../lib/email/types";
import { COPY } from "../../lib/email/copy";
import { C } from "./Layout";

const DOT: Record<string, string> = {
  paper: C.sun,
  cardboard: "#B8864B",
  organic: C.moss,
  waste: C.ink,
  mrh: C.orange,
  hazmat: C.sun,
};

/** One collection: coloured bar, label, where/when, and a practical hint. */
export function ItemCard({ item, lang, showDate = false, hint = true }: { item: EmailItem; lang: Lang; showDate?: boolean; hint?: boolean }) {
  const where = [item.stationName, item.address].filter(Boolean).join(", ");
  const meta = [showDate ? formatShortDate(item.date, lang) : null, item.time, where || null].filter(Boolean).join(" · ");
  return (
    <Section
      style={{
        backgroundColor: C.paper,
        borderLeft: `6px solid ${DOT[item.type] ?? C.ink}`,
        borderRadius: 12,
        padding: "10px 14px",
        margin: "0 0 8px",
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: 700, margin: 0, color: C.ink }}>{TYPE_LABELS[lang][item.type]}</Text>
      {meta && <Text style={{ fontSize: 14, margin: "2px 0 0", color: C.muted }}>{meta}</Text>}
      {hint && TYPE_HINTS[lang][item.type] && (
        <Text style={{ fontSize: 13, lineHeight: "19px", margin: "6px 0 0", color: C.ink }}>{TYPE_HINTS[lang][item.type]}</Text>
      )}
    </Section>
  );
}

/** Bullet list of what the subscriber chose. */
export function Summary({ summary, lang }: { summary: SubscriptionSummary; lang: Lang }) {
  const t = COPY[lang];
  const lines = [
    summary.plz ? t.summaryPlz(summary.plz) : null,
    summary.stationName ? t.summaryStation(summary.stationName) : null,
    summary.topics.map((x) => TYPE_LABELS[lang][x]).join(", "),
    summary.reminders ? t.summaryReminders : null,
    summary.digest ? t.summaryDigest : null,
  ].filter(Boolean) as string[];
  return (
    <Section style={{ backgroundColor: C.mint, borderRadius: 12, padding: "10px 14px", margin: "0 0 16px" }}>
      {lines.map((l) => (
        <Text key={l} style={{ fontSize: 15, lineHeight: "22px", margin: 0, color: C.ink }}>
          • {l}
        </Text>
      ))}
    </Section>
  );
}
