"use client";

import { useLang } from "@/components/i18n/LangProvider";
import { kindShort } from "@/lib/geo/kinds";
import { STATION_KINDS, type StationKind } from "@/lib/geo/types";
import { KindDot } from "./KindDot";

export function TypeFilterChips({
  active,
  onToggle,
}: {
  active: StationKind[];
  onToggle: (kind: StationKind) => void;
}) {
  const { lang, t } = useLang();
  return (
    // Wraps onto a second line on phones instead of scrolling sideways: a
    // horizontal scroll strip on top of the map is hard to discover and the
    // map steals the swipe. One line from md up.
    <div role="group" aria-label={t.map.filterAria} className="flex flex-wrap gap-1.5 md:flex-nowrap md:gap-2">
      {STATION_KINDS.map((kind) => {
        const on = active.includes(kind);
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(kind)}
            className={`pointer-events-auto flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-[13px] font-bold shadow-sm transition md:gap-2 md:py-1.5 md:pr-3.5 md:pl-1.5 md:text-sm ${
              on ? "bg-white text-ink" : "bg-white/70 text-ink/45"
            }`}
          >
            <span className={on ? "" : "opacity-40 grayscale"}>
              <KindDot kind={kind} />
            </span>
            {kindShort(kind, lang)}
          </button>
        );
      })}
    </div>
  );
}
