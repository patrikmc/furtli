"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LANG, HTML_LANG, LANG_COOKIE, LANG_COOKIE_MAX_AGE_S, LANG_PARAM, type Lang } from "@/lib/i18n/lang";
import { ui, type UI } from "@/lib/i18n/ui";

interface LangContextValue {
  lang: Lang;
  t: UI;
  setLang: (lang: Lang) => void;
}

// Without a provider (component tests), everything is German.
const LangContext = createContext<LangContextValue>({ lang: DEFAULT_LANG, t: ui(DEFAULT_LANG), setLang: () => {} });

/**
 * Site language for client components. The server reads the same cookie
 * (lib/i18n/server.ts) and passes the initial value in, so the first render
 * matches. Switching writes the cookie, updates client components at once
 * and refreshes server components (titles, `<html lang>`, the /abo pages).
 */
export function LangProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initialLang);
  // The server's value wins when it changes (e.g. a ?lang= link followed inside the app).
  const [serverLang, setServerLang] = useState<Lang>(initialLang);
  if (serverLang !== initialLang) {
    setServerLang(initialLang);
    setLangState(initialLang);
  }

  const setLang = useCallback(
    (next: Lang) => {
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${LANG_COOKIE_MAX_AGE_S}; samesite=lax`;
      document.documentElement.lang = HTML_LANG[next];
      // A ?lang= in the address bar would switch it back on the next load.
      const url = new URL(window.location.href);
      if (url.searchParams.has(LANG_PARAM)) {
        url.searchParams.delete(LANG_PARAM);
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
      setLangState(next);
      router.refresh();
    },
    [router],
  );

  const value = useMemo(() => ({ lang, t: ui(lang), setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}
