import type { Metadata } from "next";
import Link from "next/link";
import { getDb, hasDatabase } from "db";
import { AboShell, primaryButton, secondaryButton } from "@/components/abo/AboShell";
import { summaryLines } from "@/lib/email/summary";
import { getLang, getLangOr } from "@/lib/i18n/server";
import { ui } from "@/lib/i18n/ui";
import { confirmPreview } from "@/lib/subscriptions/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: ui(await getLang()).meta.confirm, robots: { index: false, follow: false } };
}

/**
 * Landing page of the confirmation link. Confirming is a button (POST), not the link itself.
 * Language: the link carries the email's language (?lang=, stored by the proxy); older
 * links without it fall back to the email's language unless the visitor has chosen one.
 */
export default async function ConfirmPage({ searchParams }: PageProps<"/abo/bestaetigen">) {
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : "";
  const preview = token && hasDatabase() ? await confirmPreview(getDb(), token) : null;
  const lang = preview ? await getLangOr(preview.lang) : await getLang();
  const t = ui(lang).abo;

  if (!preview || preview.expired) {
    return (
      <AboShell lang={lang} title={preview?.expired ? t.confirmExpiredTitle : t.confirmInvalidTitle}>
        <p className="text-lg text-ink/75">{preview?.expired ? t.confirmExpired : t.confirmInvalid}</p>
        <Link href="/" className={secondaryButton}>
          {t.toMap}
        </Link>
      </AboShell>
    );
  }

  // The whole subscription as it will be after confirming; new/changed parts are marked.
  const lines = summaryLines(preview.summary, lang);

  return (
    <AboShell lang={lang} title={preview.isUpdate ? t.confirmUpdateTitle : t.confirmTitle}>
      {preview.isUpdate && <p className="text-lg text-ink/75">{t.confirmUpdateIntro}</p>}
      <ul className="space-y-1 rounded-2xl bg-mint px-4 py-3 text-ink">
        {lines.map((l) => (
          <li key={l}>• {l}</li>
        ))}
      </ul>
      <form method="post" action="/api/email/confirm">
        <input type="hidden" name="t" value={token} />
        <input type="hidden" name="lang" value={lang} />
        <button type="submit" className={primaryButton}>
          {t.confirmButton}
        </button>
      </form>
      <p className="text-sm text-ink/60">{t.confirmFootnote}</p>
    </AboShell>
  );
}
