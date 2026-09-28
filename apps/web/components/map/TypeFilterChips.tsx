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
    <div role="group" aria-label={t.map.filterAria} className="flex gap-2 overflow-x-auto pb-1">
      {STATION_KINDS.map((kind) => {
        const on = active.includes(kind);
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(kind)}
            className={`pointer-events-auto flex shrink-0 items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-sm font-bold shadow-sm transition ${
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
