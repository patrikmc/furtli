import Link from "next/link";
import type { ReactNode } from "react";
import { LangProvider } from "@/components/i18n/LangProvider";
import { LangToggle } from "@/components/i18n/LangToggle";
import type { Lang } from "@/lib/i18n/lang";

/**
 * Simple branded page for the subscription steps (confirm, unsubscribe,
 * result) and other standalone pages. `lang` is the language the page is
 * rendered in; pages opened from an email may use the email's language
 * before the visitor has chosen one, so the toggle gets it from here.
 */
export function AboShell({ lang, title, children }: { lang: Lang; title: string; children: ReactNode }) {
  return (
    <LangProvider initialLang={lang}>
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-6 py-16">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="font-display text-2xl font-extrabold text-ink">
            furtli<span className="text-orange">.</span>
          </Link>
          <LangToggle />
        </div>
        <h1 className="font-display text-4xl leading-tight font-bold text-ink">{title}</h1>
        {children}
      </main>
    </LangProvider>
  );
}

export const primaryButton = "self-start rounded-2xl bg-orange px-5 py-3 font-display text-lg font-bold text-white shadow-sm hover:brightness-105";
export const secondaryButton = "self-start rounded-2xl bg-ink px-5 py-3 font-bold text-white";
