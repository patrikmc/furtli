"use client";

import { useState, type ReactNode } from "react";
import { bandLabel, formatDistance, type NearbyMode, type ResolvedAnchor } from "geo";
import { anchorSubtitle, anchorTitle, RADII, strictAreaName, type Radius } from "@/lib/geo/anchor";
import { groupDates, groupPlaces, type Group, type StationResult } from "@/lib/geo/group";
import { KINDS, MATERIAL_LABELS, timeWindow } from "@/lib/geo/kinds";
import type { PlzCalendar } from "@/lib/geo/types";
import { SubscribeForm } from "@/components/subscribe/SubscribeForm";
import { KindDot } from "./KindDot";
import { Sheet } from "./Sheet";
import { formatDate } from "./StationSheet";

const shortDate = new Intl.DateTimeFormat("de-CH", { weekday: "short", day: "numeric", month: "numeric", timeZone: "Europe/Zurich" });
/** "Mi., 30.9." */
function formatShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return shortDate.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

const KERBSIDE_LABELS: Record<string, string> = {
  paper: "Papier",
  cardboard: "Karton",
  organic: "Bioabfall",
  waste: "Kehricht",
};

type Tab = "dates" | "places";

/**
 * "What's near here?" for the current search location, grouped by distance.
 * Dates: upcoming MRH / hazmat dates, soonest first within each distance band.
 * Places: every station (incl. Sammelstellen, Recyclinghöfe), nearest first.
 */
export function NearbyPanel({
  resolved,
  results,
  mode,
  radius,
  today,
  calendar,
  picker,
  onModeChange,
  onRadiusChange,
  onSelectStation,
  onClose,
}: {
  resolved: ResolvedAnchor;
  results: StationResult[];
  mode: NearbyMode;
  radius: Radius;
  today: string;
  calendar: PlzCalendar | null;
  picker: ReactNode;
  onModeChange: (m: NearbyMode) => void;
  onRadiusChange: (r: Radius) => void;
  onSelectStation: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("dates");
  const areaName = strictAreaName(resolved);
  const isArea = resolved.anchor.type !== "point";
  const bandAreaName = isArea ? (resolved.anchor.type === "kreis" ? `Kreis ${resolved.kreis}` : `PLZ ${resolved.plz}`) : null;
  const dateGroups = groupDates(results, today);
  const placeGroups = groupPlaces(results);
  const dateCount = dateGroups.reduce((n, g) => n + g.items.length, 0);
  const anchorPlz = resolved.plz;

  const subtitle = [
    anchorSubtitle(resolved),
    resolved.anchor.type === "point" && resolved.anchor.source === "map" ? "Pin verschieben oder woanders tippen" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Sheet title={anchorTitle(resolved.anchor)} subtitle={subtitle || undefined} onClose={onClose} testId="nearby-panel">
      <div className="mt-2 space-y-2.5 md:mt-3 md:space-y-3">
        {picker}

        {/* Scope: nearby (default) or only inside the Kreis / postcode */}
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Suchbereich" className="flex rounded-xl bg-ink/5 p-1 text-sm font-bold">
            <ScopeButton active={mode === "nearby"} onClick={() => onModeChange("nearby")}>
              In der Nähe
            </ScopeButton>
            {areaName && (
              <ScopeButton active={mode === "strict"} onClick={() => onModeChange("strict")}>
                Nur {areaName}
              </ScopeButton>
            )}
          </div>
          {mode === "nearby" && (
            <select
              aria-label="Umkreis"
              value={radius}
              onChange={(e) => onRadiusChange(Number(e.target.value) as Radius)}
              className="rounded-xl border border-ink/15 bg-white px-2 py-1.5 text-sm font-bold text-ink"
            >
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {isArea ? "+ " : ""}
                  {r >= 1000 ? `${r / 1000} km` : `${r} m`}
                </option>
              ))}
            </select>
          )}
        </div>

        {calendar && Object.keys(calendar.next).length > 0 && (
          <div data-testid="kerbside" className="rounded-2xl bg-white px-3 py-2.5">
            <h3 className="text-xs font-bold tracking-wide text-ink/60 uppercase">Abfuhr in {calendar.plz}</h3>
            <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {(["paper", "cardboard", "organic", "waste"] as const).map((t) =>
                calendar.next[t]?.[0] ? (
                  <li key={t} className="flex justify-between gap-2">
                    <span className="text-ink/60">{KERBSIDE_LABELS[t]}</span>
                    <span className="font-bold whitespace-nowrap text-ink">{formatShort(calendar.next[t]![0])}</span>
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        )}

        {anchorPlz && <SubscribeForm key={anchorPlz} plz={anchorPlz} source="nearby" />}

        <div role="tablist" aria-label="Ansicht" className="flex gap-1 border-b border-ink/10">
          <TabButton active={tab === "dates"} onClick={() => setTab("dates")}>
            Termine ({dateCount})
          </TabButton>
          <TabButton active={tab === "places"} onClick={() => setTab("places")}>
            Orte ({results.length})
          </TabButton>
        </div>

        {results.length === 0 ? (
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-ink/70">
            Keine Stationen {mode === "strict" ? `in ${areaName}` : `im Umkreis von ${formatDistance(radius)}`}.
            {mode === "nearby" && radius < 2000 && (
              <button type="button" className="ml-1 font-bold text-orange underline" onClick={() => onRadiusChange(2000)}>
                Auf 2 km erweitern
              </button>
            )}
          </div>
        ) : tab === "dates" ? (
          dateCount === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-3 text-sm text-ink/70">
              Keine anstehenden Termine hier. Unter «Orte» findest du Sammelstellen und Recyclinghöfe.
            </p>
          ) : (
            <Groups
              groups={dateGroups}
              areaName={bandAreaName}
              testId="date-groups"
              itemKey={(row) => `${row.result.item.f.properties.id}-${row.date}`}
            >
              {(row) => {
                const p = row.result.item.f.properties;
                const time = timeWindow(p.kind, p.hours, row.date);
                return (
                  <RowButton onClick={() => onSelectStation(p.id)}>
                    <KindDot kind={p.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-ink">
                        {formatDate(row.date)}
                        {time && <span className="font-normal text-ink/60"> · {time}</span>}
                      </span>
                      <span className="block truncate text-sm text-ink/70">
                        {KINDS[p.kind].short} · {p.name}
                        {p.address ? `, ${p.address}` : ""}
                      </span>
                      <OfficialBadge show={!!anchorPlz && !!p.servesPlz?.includes(anchorPlz)} plz={anchorPlz} />
                    </span>
                    <Distance r={row.result} />
                  </RowButton>
                );
              }}
            </Groups>
          )
        ) : (
          <Groups
            groups={placeGroups}
            areaName={bandAreaName}
            testId="place-groups"
            itemKey={(r) => r.item.f.properties.id}
          >
            {(r) => {
              const p = r.item.f.properties;
              const detail =
                p.kind === "sammelstelle"
                  ? (p.materials ?? []).map((m) => MATERIAL_LABELS[m] ?? m).join(", ")
                  : p.nextDates?.find((d) => d >= today)
                    ? `nächster Termin ${formatDate(p.nextDates.find((d) => d >= today)!)}`
                    : (p.address ?? "");
              return (
                <RowButton onClick={() => onSelectStation(p.id)}>
                  <KindDot kind={p.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{p.name}</span>
                    <span className="block truncate text-sm text-ink/70">
                      {KINDS[p.kind].short}
                      {detail ? ` · ${detail}` : ""}
                    </span>
                  </span>
                  <Distance r={r} />
                </RowButton>
              );
            }}
          </Groups>
        )}

        {resolved.kreis === null && resolved.anchor.type === "point" && (
          <p className="text-xs text-ink/50">Der Punkt liegt ausserhalb der Stadt Zürich; es werden die nächsten Stationen gezeigt.</p>
        )}
      </div>
    </Sheet>
  );
}

function Groups<T>({
  groups,
  areaName,
  testId,
  itemKey,
  children,
}: {
  groups: Group<T>[];
  areaName: string | null;
  testId: string;
  itemKey: (item: T) => string;
  children: (item: T) => ReactNode;
}) {
  return (
    <div data-testid={testId} className="space-y-4">
      {groups.map((g) => (
        <section key={g.band} aria-label={bandLabel(g.band, areaName)}>
          <h3 className="mb-1.5 text-xs font-bold tracking-wide text-ink/60 uppercase">{bandLabel(g.band, areaName)}</h3>
          <ul className="space-y-1.5">
            {g.items.map((it) => (
              <li key={itemKey(it)}>{children(it)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RowButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-left hover:bg-mint/60"
    >
      {children}
    </button>
  );
}

function Distance({ r }: { r: StationResult }) {
  return (
    <span className="shrink-0 text-right text-xs text-ink/60 tabular-nums">
      {r.distance === 0 ? "im Gebiet" : formatDistance(r.distance)}
    </span>
  );
}

function OfficialBadge({ show, plz }: { show: boolean; plz: string | null }) {
  if (!show) return null;
  return (
    <span className="mt-1 inline-block rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold text-moss">
      offiziell für {plz}
    </span>
  );
}

function ScopeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-1 ${active ? "bg-white text-ink shadow-sm" : "text-ink/55"}`}
    >
      {children}
    </button>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold ${active ? "border-orange text-ink" : "border-transparent text-ink/50"}`}
    >
      {children}
    </button>
  );
}
