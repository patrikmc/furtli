"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Bottom sheet below 768 px, left side panel above (acceptance A4).
 * One container for both the nearby list and station details.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  onBack,
  testId,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  testId: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section
      role="dialog"
      aria-label={title}
      data-testid={testId}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 max-h-[58dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-paper px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(23,34,59,0.18)] md:inset-x-auto md:top-[7.5rem] md:bottom-auto md:left-4 md:max-h-[calc(100dvh-9rem)] md:w-[26rem] md:rounded-3xl md:pt-5"
    >
      <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/15 md:hidden" aria-hidden />
      <div className="flex items-start gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Zurück zur Liste"
            className="-mt-0.5 -ml-2 rounded-full p-2 text-ink/60 hover:bg-ink/5 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl leading-tight font-bold text-ink">{title}</h2>
          {subtitle && <div className="mt-0.5 text-sm text-ink/60">{subtitle}</div>}
        </div>
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
      {children}
    </section>
  );
}
