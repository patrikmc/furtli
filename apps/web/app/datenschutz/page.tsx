import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Datenschutz" };

const contact = process.env.EMAIL_CONTACT_ADDRESS || "hallo@furtli.ch";

/**
 * DRAFT privacy notice (revDSG). Have it reviewed before launch, and keep the
 * list of service providers in sync with what the app actually uses.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-14 text-ink">
      <Link href="/" className="font-display text-2xl font-extrabold">
        furtli<span className="text-orange">.</span>
      </Link>
      <h1 className="mt-6 font-display text-4xl font-bold">Datenschutz</h1>
      <div className="mt-6 space-y-5 text-base leading-relaxed text-ink/80">
        <p>
          Furtli zeigt dir, wo und wann du in Zürich entsorgen kannst. Die Karte funktioniert ohne Konto. Wir sammeln so
          wenig Daten wie möglich.
        </p>
        <h2 className="font-display text-xl font-bold text-ink">Karte</h2>
        <p>
          Wenn du auf die Karte tippst oder deinen Standort nutzt, wird die Suche in deinem Browser berechnet. Dein
          Standort wird nicht gespeichert.
        </p>
        <h2 className="font-display text-xl font-bold text-ink">Statistik</h2>
        <p>
          Wir zählen Besuche mit Umami, ohne Cookies und ohne Profile. Gespeichert werden die besuchte Seite, die
          Herkunft (z.&nbsp;B. ein Link aus einem Newsletter), Browser- und Gerätetyp sowie das Land. Den getippten Punkt
          auf der Karte übermitteln wir nicht.
        </p>
        <h2 className="font-display text-xl font-bold text-ink">E-Mail-Erinnerungen</h2>
        <p>
          Wenn du Erinnerungen abonnierst, speichern wir deine E-Mail-Adresse, deine Postleitzahl oder deinen gewählten
          Standort, deine Auswahl, den Zeitpunkt deiner Zustimmung und über welchen Link du zu uns gekommen bist. Wir
          schicken erst etwas, wenn du den Link in der Bestätigungs-E-Mail angeklickt hast. Abmelden kannst du dich
          jederzeit über den Link in jeder E-Mail; danach schicken wir nichts mehr.
        </p>
        <h2 className="font-display text-xl font-bold text-ink">Dienstleister</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Vercel (Hosting der Website)</li>
          <li>Neon (Datenbank)</li>
          <li>Resend (Versand der E-Mails)</li>
          <li>Umami (Besuchsstatistik ohne Cookies)</li>
        </ul>
        <h2 className="font-display text-xl font-bold text-ink">Kontakt</h2>
        <p>
          Fragen, Auskunft oder Löschung: <a className="font-bold underline" href={`mailto:${contact}`}>{contact}</a>
        </p>
      </div>
    </main>
  );
}
