"use client";

import { useId } from "react";
import { LANGS, type Lang } from "@/lib/i18n/lang";
import { useLang } from "./LangProvider";

/** DE / EN switch with flags. Changes the site language and the default email language. */
export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, t, setLang } = useLang();
  return (
    <div
      role="group"
      aria-label={t.toggle.label}
      data-testid="lang-toggle"
      className={`pointer-events-auto inline-flex shrink-0 rounded-full bg-white/90 p-0.5 text-xs font-bold shadow-sm ring-1 ring-ink/10 ${className}`}
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          aria-label={t.toggle[l]}
          title={t.toggle[l]}
          onClick={() => lang !== l && setLang(l)}
          className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition ${
            lang === l ? "bg-ink text-white" : "text-ink/60 hover:text-ink"
          }`}
        >
          <Flag lang={l} />
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** Small inline SVG flags (no emoji: Windows shows flag emoji as letters). */
function Flag({ lang }: { lang: Lang }) {
  const clip = `uk-${useId().replace(/:/g, "")}`;
  const cls = "h-3 w-[1.125rem] shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/10";
  if (lang === "de") {
    return (
      <svg viewBox="0 0 5 3" className={cls} aria-hidden>
        <rect width="5" height="1" fill="#000" />
        <rect y="1" width="5" height="1" fill="#DD0000" />
        <rect y="2" width="5" height="1" fill="#FFCE00" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 60 30" className={cls} aria-hidden>
      <clipPath id={clip}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${clip})`} stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}
