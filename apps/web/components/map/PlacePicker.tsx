"use client";

import type { Anchor } from "geo";
import type { ReactNode } from "react";

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
  const sel =
    "min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-2.5 py-2 text-sm font-bold text-ink shadow-sm";
  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "flex-wrap"}`}>
      {locate}
      <select
        aria-label="Postleitzahl wählen"
        className={sel}
        value={anchor?.type === "plz" ? anchor.plz : ""}
        onChange={(e) => e.target.value && onPick({ type: "plz", plz: e.target.value })}
      >
        <option value="">PLZ …</option>
        {cityPlz.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select
        aria-label="Kreis wählen"
        className={sel}
        value={anchor?.type === "kreis" ? String(anchor.kreis) : ""}
        onChange={(e) => e.target.value && onPick({ type: "kreis", kreis: Number(e.target.value) })}
      >
        <option value="">Kreis …</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((k) => (
          <option key={k} value={k}>
            Kreis {k}
          </option>
        ))}
      </select>
    </div>
  );
}
