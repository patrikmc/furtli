import type { Metadata } from "next";
import Link from "next/link";
import { getDb, hasDatabase } from "db";
import { AboShell, primaryButton, secondaryButton } from "@/components/abo/AboShell";
import { summaryLines } from "@/lib/email/summary";
import { confirmPreview } from "@/lib/subscriptions/service";

export const metadata: Metadata = { title: "Anmeldung bestätigen", robots: { index: false, follow: false } };

/** Landing page of the confirmation link. Confirming is a button (POST), not the link itself. */
export default async function ConfirmPage({ searchParams }: PageProps<"/abo/bestaetigen">) {
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  const preview = token && hasDatabase() ? await confirmPreview(getDb(), token) : null;

  if (!preview || preview.expired) {
    return (
      <AboShell title={preview?.expired ? "Link abgelaufen" : "Link ungültig"}>
        <p className="text-lg text-ink/75">
          {preview?.expired
            ? "Dieser Bestätigungslink ist älter als 7 Tage. Melde dich auf der Karte einfach nochmals an."
            : "Diesen Link kennen wir nicht, oder er wurde schon benutzt. Vielleicht bist du bereits angemeldet."}
        </p>
        <Link href="/" className={secondaryButton}>
          ← Zur Karte
        </Link>
      </AboShell>
    );
  }

  // The whole subscription as it will be after confirming; new/changed parts are marked.
  const lines = summaryLines(preview.summary, "de");

  return (
    <AboShell title={preview.isUpdate ? "Ergänzung bestätigen" : "Erinnerungen bestätigen"}>
      {preview.isUpdate && <p className="text-lg text-ink/75">So sieht dein Abo nach der Bestätigung aus:</p>}
      <ul className="space-y-1 rounded-2xl bg-mint px-4 py-3 text-ink">
        {lines.map((l) => (
          <li key={l}>• {l}</li>
        ))}
      </ul>
      <form method="post" action="/api/email/confirm">
        <input type="hidden" name="t" value={token} />
        <button type="submit" className={primaryButton}>
          Ja, erinnere mich
        </button>
      </form>
      <p className="text-sm text-ink/60">Abmelden kannst du dich jederzeit über den Link in jeder E-Mail.</p>
    </AboShell>
  );
}
