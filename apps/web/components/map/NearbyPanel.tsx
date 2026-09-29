"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { bandLabel, formatDistance, type ResolvedAnchor } from "geo";
import { anchorSubtitle, anchorTitle, RADII, type Radius } from "@/lib/geo/anchor";
import { groupDates, groupPlaces, type Group, type StationResult } from "@/lib/geo/group";
import { kindShort, materialLabel, timeWindow } from "@/lib/geo/kinds";
import { formatDate, formatShortDate } from "@/lib/i18n/format";
import { TYPE_LABELS } from "@/lib/email/copy";
import { useLang } from "@/components/i18n/LangProvider";
import { track } from "@/lib/analytics/umami";
import { MATERIALS, type Material, type PlzCalendar } from "@/lib/geo/types";
import { SubscribeForm } from "@/components/subscribe/SubscribeForm";
import { KindDot } from "./KindDot";
import { Sheet } from "./Sheet";

type Tab = "dates" | "places";

/**
 * "What's near here?" for the current search location, grouped by distance.
 * Dates: upcoming MRH / hazmat dates, soonest first within each distance band.
 * Places: every station (incl. Sammelstellen, Recyclinghöfe), nearest first.
 */
export function NearbyPanel({
  resolved,
  results,
  radius,
  today,
  calendar,
  picker,
  onRadiusChange,
  material,
  onMaterialChange,
  previewId,
  onPreviewStation,
  onClose,
}: {
  resolved: ResolvedAnchor;
  results: StationResult[];
  radius: Radius;
  today: string;
  calendar: PlzCalendar | null;
  /** Postcode picker row; the radius select is passed in to sit next to it. */
  picker: (trailing?: ReactNode) => ReactNode;
  onRadiusChange: (r: Radius) => void;
  /** Only Sammelstellen that take this material; null = everything. */
  material: Material | null;
  onMaterialChange: (m: Material | null) => void;
  /** Station marked on the map by a first tap; tapping its row again opens it. */
  previewId: string | null;
  onPreviewStation: (id: string) => void;
  onClose: () => void;
}) {
  const { lang, t } = useLang();
  const [tab, setTab] = useState<Tab>(material ? "places" : "dates");
  // Picking a material jumps to «Orte»: only places carry materials (no MRH dates), so «Termine» would be empty.
  const [seenMaterial, setSeenMaterial] = useState(material);
  if (seenMaterial !== material) {
    setSeenMaterial(material);
    if (material) setTab("places");
  }
  // The row last tapped (a station can have several date rows): kept in view when the sheet shrinks.
  const [tappedKey, setTappedKey] = useState<string | null>(null);
  const tapRow = (key: string, id: string) => {
    setTappedKey(key);
    onPreviewStation(id);
  };
  const isArea = resolved.anchor.type !== "point";
  const bandAreaName = isArea ? (resolved.anchor.type === "kreis" ? t.anchor.kreis(resolved.kreis!) : t.anchor.plz(resolved.plz!)) : null;
  const dateGroups = groupDates(results, today);
  const placeGroups = groupPlaces(results);
  const dateCount = dateGroups.reduce((n, g) => n + g.items.length, 0);
  const anchorPlz = resolved.plz;

  const subtitle = [
    anchorSubtitle(resolved, lang),
    resolved.anchor.type === "point" && resolved.anchor.source === "map" ? t.nearby.moveHint : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Sheet
      title={anchorTitle(resolved.anchor, lang)}
      subtitle={subtitle || undefined}
      onClose={onClose}
      testId="nearby-panel"
      // Shrinks to compact on a new search and on a first tap, so the map shows the marked station.
      collapseKey={JSON.stringify([resolved.anchor, previewId])}
    >
      <div className="mt-2 space-y-2.5 md:mt-3 md:space-y-3">
        {picker(
          <select
            aria-label={t.nearby.radiusAria}
            value={radius}
            onChange={(e) => onRadiusChange(Number(e.target.value) as Radius)}
            className="shrink-0 rounded-xl border border-ink/15 bg-white px-2 py-2 text-sm font-bold text-ink shadow-sm"
          >
            {RADII.map((r) => (
              <option key={r} value={r}>
                {isArea ? "+ " : ""}
                {r >= 1000 ? `${r / 1000} km` : `${r} m`}
              </option>
            ))}
          </select>,
        )}

        <select
          aria-label={t.nearby.materialAria}
          value={material ?? ""}
          onChange={(e) => onMaterialChange((e.target.value || null) as Material | null)}
          className={`w-full rounded-xl border bg-white px-2.5 py-2 text-sm font-bold shadow-sm ${
            material ? "border-orange text-ink" : "border-ink/15 text-ink/70"
          }`}
        >
          <option value="">{t.nearby.materialAll}</option>
          {MATERIALS.map((m) => (
            <option key={m} value={m}>
              {materialLabel(m, lang)}
            </option>
          ))}
        </select>

        {calendar && Object.keys(calendar.next).length > 0 && (
          <div data-testid="kerbside" className="rounded-2xl bg-white px-3 py-2.5">
            <h3 className="text-xs font-bold tracking-wide text-ink uppercase">{t.nearby.kerbside(calendar.plz)}</h3>
            <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              {(["paper", "cardboard", "organic", "waste"] as const).map((k) =>
                calendar.next[k]?.[0] ? (
                  <li key={k} className="flex justify-between gap-2">
                    <span className="text-ink/60">{TYPE_LABELS[lang][k]}</span>
                    <span className="font-bold whitespace-nowrap text-ink">{formatShortDate(calendar.next[k]![0], lang)}</span>
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        )}

        {/* First CTA: free reminders (the pickup offer follows on MRH stops). */}
        {anchorPlz && <SubscribeForm key={anchorPlz} plz={anchorPlz} source="nearby" />}

        {/* What the list below shows: the Termine tab only has the mobile collections. */}
        <h3 data-testid="list-title" className="font-display text-base leading-tight font-bold text-ink">
          {tab === "dates"
            ? t.nearby.datesTitle
            : material
              ? t.nearby.materialTitle(materialLabel(material, lang))
              : t.nearby.placesTitle}
        </h3>

        <div role="tablist" aria-label={t.nearby.viewAria} className="flex gap-1 border-b border-ink/10">
          <TabButton active={tab === "dates"} onClick={() => { setTab("dates"); track("panel_change", { control: "tab", value: "dates" }); }}>
            {t.nearby.dates(dateCount)}
          </TabButton>
          <TabButton active={tab === "places"} onClick={() => { setTab("places"); track("panel_change", { control: "tab", value: "places" }); }}>
            {t.nearby.places(results.length)}
          </TabButton>
        </div>

        {results.length === 0 ? (
          <div className="rounded-2xl bg-white px-4 py-3 text-sm text-ink/70">
            {t.nearby.noneWithin(formatDistance(radius, lang))}
            {radius < 2000 && (
              <button type="button" className="ml-1 font-bold text-orange underline" onClick={() => onRadiusChange(2000)}>
                {t.nearby.widen}
              </button>
            )}
          </div>
        ) : tab === "dates" ? (
          dateCount === 0 ? (
            <p className="rounded-2xl bg-white px-4 py-3 text-sm text-ink/70">
              {t.nearby.noDates}
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
                const time = timeWindow(p.kind, p.hours, row.date, lang);
                const key = `${p.id}-${row.date}`;
                return (
                  <RowButton
                    active={previewId === p.id}
                    keepInView={previewId === p.id && tappedKey === key}
                    onClick={() => tapRow(key, p.id)}
                  >
                    <KindDot kind={p.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-ink">
                        {formatDate(row.date, lang)}
                        {time && <span className="font-normal text-ink/60"> · {time}</span>}
                      </span>
                      <span className="block truncate text-sm text-ink/70">
                        {kindShort(p.kind, lang)} · {p.name}
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
                  ? (p.materials ?? []).map((m) => materialLabel(m, lang)).join(", ")
                  : p.nextDates?.find((d) => d >= today)
                    ? t.nearby.nextDate(formatDate(p.nextDates.find((d) => d >= today)!, lang))
                    : // Curated sites: town (outside the city) and whether it costs.
                      [p.kreis ? p.address : p.place, p.fee ? t.station.paid : null].filter(Boolean).join(" · ") ||
                      (p.address ?? "");
              return (
                <RowButton
                  active={previewId === p.id}
                  keepInView={previewId === p.id && tappedKey === p.id}
                  onClick={() => tapRow(p.id, p.id)}
                >
                  <KindDot kind={p.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">{p.name}</span>
                    <span className="block truncate text-sm text-ink/70">
                      {kindShort(p.kind, lang)}
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
          <p className="text-xs text-ink/50">{t.nearby.outsidePoint}</p>
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
  const { lang } = useLang();
  return (
    <div data-testid={testId} className="space-y-4">
      {groups.map((g) => (
        <section key={g.band} aria-label={bandLabel(g.band, areaName, lang)}>
          <h3 className="mb-1.5 text-xs font-bold tracking-wide text-ink/60 uppercase">{bandLabel(g.band, areaName, lang)}</h3>
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

/**
 * A station row. First tap marks the station on the map (`active`, with a
 * hint); a second tap opens it. Hover doesn't exist on phones, so tap it is.
 */
function RowButton({
  active,
  keepInView,
  onClick,
  children,
}: {
  active: boolean;
  keepInView: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!keepInView) return;
    // After the sheet's 200 ms shrink, bring the tapped row back into view.
    const id = window.setTimeout(() => ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 250);
    return () => window.clearTimeout(id);
  }, [keepInView]);
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`w-full rounded-2xl bg-white px-3 py-2.5 text-left ${
        active ? "ring-2 ring-orange" : "hover:bg-mint/60"
      }`}
    >
      <span className="flex w-full items-center gap-3">{children}</span>
      {active && (
        <span data-testid="tap-again" className="mt-1.5 flex items-center justify-end gap-1 text-xs font-bold text-orange">
          {t.nearby.tapAgain}
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden>
            <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      )}
    </button>
  );
}

function Distance({ r }: { r: StationResult }) {
  const { lang, t } = useLang();
  return (
    <span className="shrink-0 text-right text-xs text-ink/60 tabular-nums">
      {r.distance === 0 ? t.nearby.inArea : formatDistance(r.distance, lang)}
    </span>
  );
}

function OfficialBadge({ show, plz }: { show: boolean; plz: string | null }) {
  const { t } = useLang();
  if (!show) return null;
  return (
    <span className="mt-1 inline-block rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold text-moss">
      {t.nearby.officialFor(plz ?? "")}
    </span>
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
