"use client";

import type { Anchor } from "geo";
import type { ReactNode } from "react";
import { useLang } from "@/components/i18n/LangProvider";

/**
 * Choose where to look from without sharing a location: a postcode.
 * (Tapping the map and the locate button are the other two ways; Kreis
 * deep links such as ?kreis=4 still work, there is just no Kreis picker.)
 */
export function PlacePicker({
  cityPlz,
  anchor,
  onPick,
  locate,
  trailing,
}: {
  cityPlz: readonly string[];
  anchor: Anchor | null;
  onPick: (a: Anchor) => void;
  /** Inline "use my location" button (shown on phones). */
  locate?: ReactNode;
  /** Extra control on the same row, e.g. the radius select in the nearby panel. */
  trailing?: ReactNode;
}) {
  const { t } = useLang();
  return (
    <div className="flex items-center gap-2">
      {locate}
      <select
        aria-label={t.picker.plzAria}
        className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-2.5 py-2 text-sm font-bold text-ink shadow-sm"
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
      {trailing}
    </div>
  );
}
