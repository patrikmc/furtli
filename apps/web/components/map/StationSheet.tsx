"use client";

import Link from "next/link";
import { useEffect } from "react";
import { KINDS, MATERIAL_LABELS } from "@/lib/geo/kinds";
import type { StationFeature } from "@/lib/geo/types";
import { KindDot } from "./KindDot";

const dateFmt = new Intl.DateTimeFormat("de-CH", {
  weekday: "short",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Zurich",
});

export function formatDate(iso: string): string {
  // Noon UTC is the same calendar day in Zürich all year round.
  const [y, m, d] = iso.split("-").map(Number);
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

type Props =
  | { mode: "station"; station: StationFeature; onClose: () => void }
  | {
      mode: "kreis";
      kreis: number;
      stations: StationFeature[];
      onSelectStation: (id: string) => void;
      onClose: () => void;
    };

/**
 * Bottom sheet below 768 px, left side panel above (acceptance A4).
 * One component, two layouts via Tailwind's md: breakpoint.
 */
export function StationSheet(props: Props) {
  const { onClose } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = props.mode === "station" ? props.station.properties.name : `Kreis ${props.kreis}`;

  return (
    <section
      role="dialog"
      aria-label={title}
      data-testid="station-sheet"
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 max-h-[60dvh] overflow-y-auto rounded-t-3xl bg-paper px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(23,34,59,0.18)] md:inset-x-auto md:top-[7.5rem] md:bottom-auto md:left-4 md:max-h-[calc(100dvh-9rem)] md:w-96 md:rounded-3xl md:pt-5"
    >
      <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/15 md:hidden" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-2xl leading-tight font-bold text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schliessen"
          className="-mt-1 -mr-2 rounded-full p-2 text-ink/60 hover:bg-ink/5 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {props.mode === "station" ? <StationDetails station={props.station} /> : <KreisDetails {...props} />}
    </section>
  );
}

function StationDetails({ station }: { station: StationFeature }) {
  const p = station.properties;
  const kind = KINDS[p.kind];
  return (
    <div className="mt-1 space-y-4">
      <p className="flex items-center gap-2 text-sm text-ink/70">
        <KindDot kind={p.kind} />
        {kind.label} · Kreis {p.kreis} · {p.plz}
      </p>

      {p.nextDates?.length ? (
        <div>
          <h3 className="text-xs font-bold tracking-wide text-ink/60 uppercase">Nächste Termine</h3>
          <ul className="mt-2 space-y-1.5">
            {p.nextDates.map((d, i) => (
              <li
                key={d}
                className={`rounded-xl px-3 py-2 ${i === 0 ? "bg-mint font-bold text-ink" : "bg-white text-ink/80"}`}
              >
                {formatDate(d)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.materials?.length ? (
        <div>
          <h3 className="text-xs font-bold tracking-wide text-ink/60 uppercase">Hier kannst du entsorgen</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {p.materials.map((m) => (
              <li key={m} className="rounded-full bg-white px-3 py-1 text-sm text-ink">
                {MATERIAL_LABELS[m] ?? m}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {p.kind === "mrh" && (
        <Link
          href={`/abholen?station=${encodeURIComponent(p.id)}`}
          className="block rounded-2xl bg-orange px-5 py-3.5 text-center font-display text-lg font-bold text-white shadow-sm hover:brightness-105"
        >
          Keine Zeit? Wir bringen&apos;s hin
        </Link>
      )}

      {p.placeholder && (
        <p className="text-xs text-ink/50">Beispieldaten: Ort und Termine sind nicht echt.</p>
      )}
    </div>
  );
}

function KreisDetails({
  stations,
  onSelectStation,
}: {
  kreis: number;
  stations: StationFeature[];
  onSelectStation: (id: string) => void;
}) {
  if (!stations.length) {
    return <p className="mt-2 text-ink/70">Keine Stationen in diesem Kreis (mit den aktuellen Filtern).</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {stations.map((s) => (
        <li key={s.properties.id}>
          <button
            type="button"
            onClick={() => onSelectStation(s.properties.id)}
            className="flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-left hover:bg-mint/60"
          >
            <KindDot kind={s.properties.kind} />
            <span className="flex-1">
              <span className="block font-bold text-ink">{s.properties.name}</span>
              <span className="block text-sm text-ink/60">
                {KINDS[s.properties.kind].short}
                {s.properties.nextDates?.[0] ? ` · ${formatDate(s.properties.nextDates[0])}` : ""}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
