import type { Metadata } from "next";
import Link from "next/link";
import { AboShell, secondaryButton } from "@/components/abo/AboShell";
import { getLang } from "@/lib/i18n/server";
import { ui } from "@/lib/i18n/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: ui(await getLang()).meta.pickup };
}

/** Placeholder for the pickup booking flow (the "Wir bringen's hin" CTA target). */
export default async function AbholenPage() {
  const lang = await getLang();
  const t = ui(lang).pickup;
  return (
    <AboShell lang={lang} title={t.title}>
      <p className="text-lg text-ink/75">{t.text}</p>
      <Link href="/" className={secondaryButton}>
        {t.back}
      </Link>
    </AboShell>
  );
}
