import type { Metadata } from "next";
import Link from "next/link";
import { LangProvider } from "@/components/i18n/LangProvider";
import { LangToggle } from "@/components/i18n/LangToggle";
import type { Lang } from "@/lib/i18n/lang";
import { getLang } from "@/lib/i18n/server";
import { ui } from "@/lib/i18n/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: ui(await getLang()).meta.privacy };
}

const contact = process.env.EMAIL_CONTACT_ADDRESS || "hallo@furtli.ch";

const TEXT: Record<Lang, { title: string; intro: string; sections: { h: string; p: string }[]; providers: string; list: string[]; contactH: string; contactP: string; binding?: string }> = {
  de: {
    title: "Datenschutz",
    intro: "Furtli zeigt dir, wo und wann du in Zürich entsorgen kannst. Die Karte funktioniert ohne Konto. Wir sammeln so wenig Daten wie möglich.",
    sections: [
      { h: "Karte", p: "Wenn du auf die Karte tippst oder deinen Standort nutzt, wird die Suche in deinem Browser berechnet. Dein Standort wird nicht gespeichert." },
      { h: "Statistik", p: "Wir zählen Besuche mit Umami, ohne Cookies und ohne Profile. Gespeichert werden die besuchte Seite, die Herkunft (z. B. ein Link aus einem Newsletter), Browser- und Gerätetyp sowie das Land. Den getippten Punkt auf der Karte übermitteln wir nicht." },
      { h: "Spracheinstellung", p: "Wenn du die Sprache wechselst oder einem Link in einer englischen E-Mail folgst, merkt sich dein Browser die Sprache in einem Cookie (furtli_lang, ein Jahr). Es enthält nur «de» oder «en»." },
      { h: "E-Mail-Erinnerungen", p: "Wenn du Erinnerungen abonnierst, speichern wir deine E-Mail-Adresse, deine Postleitzahlen oder gewählten Standorte, deine Auswahl, die Sprache der E-Mails, den Zeitpunkt deiner Zustimmung und über welchen Link du zu uns gekommen bist. Wir schicken erst etwas, wenn du den Link in der Bestätigungs-E-Mail angeklickt hast. Abmelden kannst du dich jederzeit über den Link in jeder E-Mail; danach schicken wir nichts mehr." },
    ],
    providers: "Dienstleister",
    list: ["Vercel (Hosting der Website)", "Neon (Datenbank)", "Resend (Versand der E-Mails)", "Umami (Besuchsstatistik ohne Cookies)"],
    contactH: "Kontakt",
    contactP: "Fragen, Auskunft oder Löschung:",
  },
  en: {
    title: "Privacy",
    intro: "Furtli shows you where and when to get rid of things in Zurich. The map works without an account. We collect as little data as possible.",
    sections: [
      { h: "Map", p: "When you tap the map or use your location, the search is calculated in your browser. Your location is not stored." },
      { h: "Statistics", p: "We count visits with Umami, without cookies and without profiles. We store the page visited, where the visit came from (e.g. a link in a newsletter), browser and device type, and the country. We don't send the point you tapped on the map." },
      { h: "Language setting", p: "When you switch the language or follow a link in an English email, your browser remembers the language in a cookie (furtli_lang, one year). It only contains “de” or “en”." },
      { h: "Email reminders", p: "When you subscribe to reminders, we store your email address, your postcodes or chosen stops, your choices, the language of the emails, when you gave your consent and which link brought you to us. We send nothing until you've clicked the link in the confirmation email. You can unsubscribe at any time with the link in every email; after that we send nothing more." },
    ],
    providers: "Service providers",
    list: ["Vercel (website hosting)", "Neon (database)", "Resend (sending emails)", "Umami (visit statistics without cookies)"],
    contactH: "Contact",
    contactP: "Questions, access to your data or deletion:",
    binding: "This is a translation; the German version applies.",
  },
};

/**
 * DRAFT privacy notice (revDSG). Have it reviewed before launch, and keep the
 * list of service providers in sync with what the app actually uses.
 * German is the binding version; keep the English translation in step.
 */
export default async function PrivacyPage() {
  const lang = await getLang();
  const t = TEXT[lang];
  return (
    <LangProvider initialLang={lang}>
      <main className="mx-auto max-w-2xl px-6 py-14 text-ink">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="font-display text-2xl font-extrabold">
            furtli<span className="text-orange">.</span>
          </Link>
          <LangToggle />
        </div>
        <h1 className="mt-6 font-display text-4xl font-bold">{t.title}</h1>
        <div className="mt-6 space-y-5 text-base leading-relaxed text-ink/80">
          <p>{t.intro}</p>
          {t.sections.map((s) => (
            <section key={s.h} className="space-y-2">
              <h2 className="font-display text-xl font-bold text-ink">{s.h}</h2>
              <p>{s.p}</p>
            </section>
          ))}
          <h2 className="font-display text-xl font-bold text-ink">{t.providers}</h2>
          <ul className="list-disc space-y-1 pl-5">
            {t.list.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <h2 className="font-display text-xl font-bold text-ink">{t.contactH}</h2>
          <p>
            {t.contactP}{" "}
            <a className="font-bold underline" href={`mailto:${contact}`}>
              {contact}
            </a>
          </p>
          {t.binding && <p className="text-sm text-ink/60">{t.binding}</p>}
        </div>
      </main>
    </LangProvider>
  );
}
