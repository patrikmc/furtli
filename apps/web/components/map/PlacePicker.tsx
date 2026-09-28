"use client";

import type { Anchor } from "geo";
import type { ReactNode } from "react";
import { useLang } from "@/components/i18n/LangProvider";

/**
 * Choose where to look from without sharing a location: a postcode or a
 * Kreis. (Tapping the map and the locate button are the other two ways.)
 */
export function PlacePicker({
  cityPlz,
  anchor,
  onPick,
  locate,
  compact = false,
}: {
  cityPlz: readonly string[];
  anchor: Anchor | null;
  onPick: (a: Anchor) => void;
  /** Inline "use my location" button (shown on phones). */
  locate?: ReactNode;
  compact?: boolean;
}) {
  const { t } = useLang();
  const sel =
    "min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-2.5 py-2 text-sm font-bold text-ink shadow-sm";
  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "flex-wrap"}`}>
      {locate}
      <select
        aria-label={t.picker.plzAria}
        className={sel}
        value={anchor?.type === "plz" ? anchor.plz : ""}
        onChange={(e) => e.target.value && onPick({ type: "plz", plz: e.target.value })}
      >
        <option value="">{t.picker.plzPlaceholder}</option>
        {cityPlz.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select
        aria-label={t.picker.kreisAria}
        className={sel}
        value={anchor?.type === "kreis" ? String(anchor.kreis) : ""}
        onChange={(e) => e.target.value && onPick({ type: "kreis", kreis: Number(e.target.value) })}
      >
        <option value="">{t.picker.kreisPlaceholder}</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((k) => (
          <option key={k} value={k}>
            {t.anchor.kreis(k)}
          </option>
        ))}
      </select>
    </div>
  );
}
