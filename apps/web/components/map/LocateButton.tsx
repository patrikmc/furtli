"use client";

import { useState } from "react";

export type LocateResult = { lng: number; lat: number };

/**
 * "Use my location". If the user denies permission or the browser has no
 * geolocation, the map keeps working and we show a short hint (A5).
 */
export function LocateButton({
  onLocate,
  hint,
  setHint,
}: {
  onLocate: (pos: LocateResult) => void;
  hint: string | null;
  setHint: (hint: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  function locate() {
    setHint(null);
    if (!("geolocation" in navigator)) {
      setHint("Dein Browser unterstützt keine Standortabfrage.");
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
            ? "Standort nicht freigegeben. Tippe deinen Kreis auf der Karte an."
            : "Standort konnte nicht ermittelt werden.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="pointer-events-none absolute right-2.5 bottom-[7.5rem] z-10 flex flex-col items-end gap-2">
      {hint && (
        <p
          role="status"
          className="pointer-events-auto max-w-60 rounded-xl bg-ink px-3 py-2 text-sm text-white shadow-lg"
        >
          {hint}
        </p>
      )}
      <button
        type="button"
        onClick={locate}
        disabled={busy}
        aria-label="Meinen Standort verwenden"
        className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white text-ink shadow-md hover:bg-mint disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${busy ? "animate-pulse" : ""}`} aria-hidden>
          <circle cx="12" cy="12" r="3.5" fill="currentColor" />
          <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
