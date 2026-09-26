import Link from "next/link";
import type { ReactNode } from "react";

/** Simple branded page for the subscription steps (confirm, unsubscribe, result). */
export function AboShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-6 py-16">
      <Link href="/" className="font-display text-2xl font-extrabold text-ink">
        furtli<span className="text-orange">.</span>
      </Link>
      <h1 className="font-display text-4xl leading-tight font-bold text-ink">{title}</h1>
      {children}
    </main>
  );
}

export const primaryButton = "self-start rounded-2xl bg-orange px-5 py-3 font-display text-lg font-bold text-white shadow-sm hover:brightness-105";
export const secondaryButton = "self-start rounded-2xl bg-ink px-5 py-3 font-bold text-white";
