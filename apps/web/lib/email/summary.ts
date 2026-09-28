import { COPY, TYPE_LABELS, type Lang } from "./copy";
import type { SubscriptionSummary } from "./types";

/**
 * The whole subscription as text lines: one per thing followed, then the
 * account settings. Used by every email and by the confirmation page.
 *   "Postleitzahl 8004: Karton, Papier"
 *   "Standort: Stauffacher: Mobiler Recyclinghof (neu)"
 */
export function summaryLines(summary: SubscriptionSummary, lang: Lang): string[] {
  const t = COPY[lang];
  const targets = summary.targets.map((x) => {
    const where = x.stationName ? t.summaryStation(x.stationName) : x.plz ? t.summaryPlz(x.plz) : "";
    const line = t.summaryTarget(where, x.topics.map((k) => TYPE_LABELS[lang][k]).join(", "));
    const mark = x.change === "new" ? t.summaryNew : x.change === "changed" ? t.summaryChanged : null;
    return mark ? `${line} (${mark})` : line;
  });
  return [...targets, summary.reminders ? t.summaryReminders : null, summary.digest ? t.summaryDigest : null].filter(
    (l): l is string => !!l,
  );
}
