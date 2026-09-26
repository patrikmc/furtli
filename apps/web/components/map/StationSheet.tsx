"use client";

import Link from "next/link";
import { formatDistance } from "geo";
import { DAY_LABELS, KINDS, MATERIAL_LABELS, timeWindow } from "@/lib/geo/kinds";
import type { StationFeature } from "@/lib/geo/types";
import { SubscribeForm } from "@/components/subscribe/SubscribeForm";
import { KindDot } from "./KindDot";
import { Sheet } from "./Sheet";

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

/** Station details. Opened from the map or from the nearby list (then with a back button). */
export function StationSheet({
  station,
  onClose,
  onBack,
  distance,
  anchorPlz,
}: {
  station: StationFeature;
  onClose: () => void;
  onBack?: () => void;
  /** Distance from the search location, if there is one. */
  distance?: number;
  /** Postcode of the search location, to show "official stop for 8004". */
  anchorPlz?: string | null;
}) {
  const p = station.properties;
  const kind = KINDS[p.kind];
  const official = anchorPlz && p.servesPlz?.includes(anchorPlz);
  const weekly = p.hours && !p.hours.note ? Object.entries(p.hours) : [];

  return (
    <Sheet
      title={p.name}
      subtitle={p.address ?? undefined}
      onClose={onClose}
      onBack={onBack}
      testId="station-sheet"
    >
      <div className="mt-3 space-y-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink/70">
          <KindDot kind={p.kind} />
          <span>{kind.label}</span>
          <span aria-hidden>·</span>
          <span>{p.kreis ? `Kreis ${p.kreis}` : "ausserhalb"} · {p.plz}</span>
          {distance !== undefined && (
            <>
              <span aria-hidden>·</span>
              <span className="font-bold text-ink">{formatDistance(distance)} entfernt</span>
            </>
          )}
        </p>

        {official && (
          <p className="inline-block rounded-full bg-mint px-3 py-1 text-xs font-bold text-moss">
            Offizieller Standort für PLZ {anchorPlz}
          </p>
        )}

        {p.nextDates?.length ? (
          <div>
            <h3 className="text-xs font-bold tracking-wide text-ink/60 uppercase">Nächste Termine</h3>
            <ul className="mt-2 space-y-1.5">
              {p.nextDates.map((d, i) => {
                const time = timeWindow(p.kind, p.hours, d);
                return (
                  <li
                    key={d}
                    className={`flex justify-between rounded-xl px-3 py-2 ${i === 0 ? "bg-mint font-bold text-ink" : "bg-white text-ink/80"}`}
                  >
                    <span>{formatDate(d)}</span>
                    {time && <span className="font-normal text-ink/60">{time}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : p.kind === "mrh" || p.kind === "hazmat" ? (
          <p className="text-sm text-ink/60">Zurzeit keine Termine publiziert.</p>
        ) : null}

        {weekly.length > 0 && (
          <div>
            <h3 className="text-xs font-bold tracking-wide text-ink/60 uppercase">Öffnungszeiten</h3>
            <ul className="mt-2 grid grid-cols-2 gap-1 text-sm text-ink/80">
              {weekly.map(([d, t]) => (
                <li key={d}>
                  <span className="inline-block w-7 font-bold">{DAY_LABELS[d] ?? d}</span> {t}
                </li>
              ))}
            </ul>
          </div>
        )}

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

        {(p.kind === "mrh" || p.kind === "hazmat") && !p.placeholder && (
          <SubscribeForm key={p.id} plz={null} station={{ id: p.id, name: p.name, kind: p.kind }} source="station" />
        )}

        {p.kind === "mrh" && (
          <Link
            href={`/abholen?station=${encodeURIComponent(p.id)}`}
            data-umami-event="pickup_cta"
            data-umami-event-station={p.id}
            className="block rounded-2xl bg-orange px-5 py-3.5 text-center font-display text-lg font-bold text-white shadow-sm hover:brightness-105"
          >
            Keine Zeit? Wir bringen&apos;s hin
          </Link>
        )}

        {p.placeholder && <p className="text-xs text-ink/50">Beispieldaten: Ort und Termine sind nicht echt.</p>}
      </div>
    </Sheet>
  );
}
