import type { Metadata } from "next";
import { AboShell, secondaryButton } from "@/components/abo/AboShell";

export const metadata: Metadata = { title: "Abmelden", robots: { index: false, follow: false } };

/** Footer link target in every email. The button posts, so link scanners can't unsubscribe anyone. */
export default async function UnsubscribePage({ searchParams }: PageProps<"/abo/abmelden">) {
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  return (
    <AboShell title="Keine Erinnerungen mehr?">
      <p className="text-lg text-ink/75">Ein Klick, und wir schicken dir keine E-Mails mehr.</p>
      <form method="post" action="/api/email/unsubscribe">
        <input type="hidden" name="t" value={token} />
        <button type="submit" className={secondaryButton}>
          Abmelden
        </button>
      </form>
    </AboShell>
  );
}
