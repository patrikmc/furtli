import type { Metadata } from "next";
import Link from "next/link";
import { AboShell, secondaryButton } from "@/components/abo/AboShell";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";

export const metadata: Metadata = { title: "Erinnerungen", robots: { index: false, follow: false } };

const MESSAGES: Record<string, { title: string; text: string; event?: string }> = {
  confirmed: {
    title: "Du bist dabei",
    text: "Deine Erinnerungen sind aktiv. Wir schreiben dir jeweils am Vorabend, und eine Willkommens-E-Mail mit deinen nächsten Terminen ist unterwegs.",
    event: "subscribe_confirmed",
  },
  unsubscribed: {
    title: "Abgemeldet",
    text: "Du bekommst keine Erinnerungen mehr von uns. Die Karte kannst du natürlich weiterhin nutzen.",
    event: "unsubscribe",
  },
  expired: {
    title: "Link abgelaufen",
    text: "Dieser Bestätigungslink ist älter als 7 Tage. Melde dich auf der Karte einfach nochmals an.",
  },
  invalid: {
    title: "Link ungültig",
    text: "Diesen Link kennen wir nicht, oder er wurde schon benutzt.",
  },
  error: {
    title: "Das hat nicht geklappt",
    text: "Bitte versuch es in ein paar Minuten nochmals.",
  },
};

export default async function DonePage({ searchParams }: PageProps<"/abo/fertig">) {
  const sp = await searchParams;
  const m = MESSAGES[typeof sp.s === "string" ? sp.s : ""] ?? MESSAGES.invalid;
  return (
    <AboShell title={m.title}>
      <p className="text-lg text-ink/75">{m.text}</p>
      <Link href="/" className={secondaryButton}>
        ← Zur Karte
      </Link>
      {m.event && <TrackOnMount event={m.event} />}
    </AboShell>
  );
}
