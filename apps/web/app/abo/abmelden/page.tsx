import type { Metadata } from "next";
import { getDb, hasDatabase } from "db";
import { AboShell, secondaryButton } from "@/components/abo/AboShell";
import { getLang, getLangOr } from "@/lib/i18n/server";
import { ui } from "@/lib/i18n/ui";
import { langForUnsubscribeToken } from "@/lib/subscriptions/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: ui(await getLang()).meta.unsubscribe, robots: { index: false, follow: false } };
}

/** Footer link target in every email. The button posts, so link scanners can't unsubscribe anyone. */
export default async function UnsubscribePage({ searchParams }: PageProps<"/abo/abmelden">) {
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  const emailLang = token && hasDatabase() ? await langForUnsubscribeToken(getDb(), token) : null;
  const lang = emailLang ? await getLangOr(emailLang) : await getLang();
  const t = ui(lang).abo;
  return (
    <AboShell lang={lang} title={t.unsubscribeTitle}>
      <p className="text-lg text-ink/75">{t.unsubscribeText}</p>
      <form method="post" action="/api/email/unsubscribe">
        <input type="hidden" name="t" value={token} />
        <input type="hidden" name="lang" value={lang} />
        <button type="submit" className={secondaryButton}>
          {t.unsubscribeButton}
        </button>
      </form>
    </AboShell>
  );
}
