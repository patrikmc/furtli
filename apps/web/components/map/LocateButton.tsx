"use client";

import { useCallback, useState } from "react";

export type LocateResult = { lng: number; lat: number };

/**
 * "Use my location". If the user denies permission or the browser has no
 * geolocation, the map keeps working and we show a short hint (A5).
 */
export function useLocate(onLocate: (pos: LocateResult) => void, setHint: (hint: string | null) => void) {
  const [busy, setBusy] = useState(false);
  const locate = useCallback(() => {
    setHint(null);
    if (!("geolocation" in navigator)) {
      setHint("Dein Browser unterstützt keine Standortabfrage. Tippe auf die Karte oder wähle PLZ oder Kreis.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onLocate({ lng: pos.coords.longitude, lat: pos.coords.latitude });
      },
      (err) => {
        setBusy(false);
        setHint(
          err.code === err.PERMISSION_DENIED
            ? "Standort nicht freigegeben. Tippe stattdessen auf die Karte oder wähle PLZ oder Kreis."
            : "Standort konnte nicht ermittelt werden.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [onLocate, setHint]);
  return { locate, busy };
}

function LocateIcon({ busy }: { busy: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 shrink-0 ${busy ? "animate-pulse" : ""}`} aria-hidden>
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Round map button (tablet/desktop; on phones the picker's inline button is used). */
export function LocateButton({ locate, busy }: { locate: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={locate}
      disabled={busy}
      aria-label="Meinen Standort verwenden"
      className="pointer-events-auto absolute right-2.5 bottom-[7.5rem] z-10 hidden h-11 w-11 place-items-center rounded-full bg-white text-ink shadow-md hover:bg-mint disabled:opacity-60 md:grid"
    >
      <LocateIcon busy={busy} />
    </button>
  );
}

/** Inline "Standort" button inside the start card / panel (phones). */
export function LocateInline({ locate, busy }: { locate: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={locate}
      disabled={busy}
      aria-label="Meinen Standort verwenden"
      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-ink/15 bg-white px-2.5 py-2 text-sm font-bold text-ink shadow-sm hover:bg-mint disabled:opacity-60 md:hidden"
    >
      <LocateIcon busy={busy} />
      Standort
    </button>
  );
}

/** Short status message under the header (location denied, outside the city, …). */
export function HintToast({ hint, onDismiss }: { hint: string | null; onDismiss: () => void }) {
  if (!hint) return null;
  return (
    <p
      role="status"
      className="pointer-events-auto absolute inset-x-3 top-[6.75rem] z-30 mx-auto max-w-md rounded-xl bg-ink px-3 py-2 text-sm text-white shadow-lg"
      onClick={onDismiss}
    >
      {hint}
    </p>
  );
}
