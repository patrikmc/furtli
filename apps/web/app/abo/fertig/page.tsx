import type { Metadata } from "next";
import Link from "next/link";
import { AboShell, secondaryButton } from "@/components/abo/AboShell";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { getLang } from "@/lib/i18n/server";
import { ui } from "@/lib/i18n/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: ui(await getLang()).meta.done, robots: { index: false, follow: false } };
}

const EVENTS: Record<string, string> = { confirmed: "subscribe_confirmed", unsubscribed: "unsubscribe" };

/**
 * Result of confirming / unsubscribing. The redirect carries ?lang= (the
 * language of the page the button was on), which the proxy stores.
 */
export default async function DonePage({ searchParams }: PageProps<"/abo/fertig">) {
  const sp = await searchParams;
  const lang = await getLang();
  const t = ui(lang).abo;
  const s = typeof sp.s === "string" && t.done[sp.s] ? sp.s : "invalid";
  const m = t.done[s];
  return (
    <AboShell lang={lang} title={m.title}>
      <p className="text-lg text-ink/75">{m.text}</p>
      <Link href="/" className={secondaryButton}>
        {t.toMap}
      </Link>
      {EVENTS[s] && <TrackOnMount event={EVENTS[s]} />}
    </AboShell>
  );
}
