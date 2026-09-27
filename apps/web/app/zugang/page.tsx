import type { Metadata } from "next";
import { AboShell, primaryButton } from "@/components/abo/AboShell";
import { safeNext } from "@/lib/access";

export const metadata: Metadata = { title: "Zugang", robots: { index: false, follow: false } };

/** Password page for the close-circle phase (see lib/access.ts and proxy.ts). */
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AccessPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const failed = sp.fehler === "1";
  return (
    <AboShell title="Noch im kleinen Kreis">
      <p className="text-lg text-ink/75">
        Furtli ist noch nicht öffentlich. Mit dem Passwort, das du von uns bekommen hast, kommst du rein.
        <span className="mt-1 block text-base text-ink/60">Not public yet — enter the password you got from us.</span>
      </p>
      <form method="post" action="/api/zugang" className="flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        {/* Lets password managers file the password under a name. */}
        <input type="text" name="username" autoComplete="username" value="furtli" readOnly hidden />
        <label htmlFor="password" className="font-bold">
          Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          aria-invalid={failed || undefined}
          aria-describedby={failed ? "password-error" : undefined}
          className="rounded-2xl border-2 border-ink/15 bg-white px-4 py-3 text-lg focus:border-orange focus:outline-none"
        />
        {failed && (
          <p id="password-error" role="alert" className="font-bold text-orange">
            Das Passwort stimmt nicht. Versuch es nochmals.
          </p>
        )}
        <button type="submit" className={primaryButton}>
          Weiter
        </button>
      </form>
    </AboShell>
  );
}
