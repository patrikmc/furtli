import Link from "next/link";

export const metadata = { title: "Abholen lassen" };

/** Placeholder for the pickup booking flow (the "Wir bringen's hin" CTA target). */
export default function AbholenPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-6 py-16">
      <p className="font-display text-2xl font-extrabold text-ink">
        furtli<span className="text-orange">.</span>
      </p>
      <h1 className="font-display text-4xl leading-tight font-bold text-ink">Wir bringen&apos;s hin.</h1>
      <p className="text-lg text-ink/75">
        Bald kannst du hier eine Abholung buchen: Wir holen deine Wertstoffe an der Haustür ab und bringen sie
        zum Mobilen Recyclinghof.
      </p>
      <Link href="/" className="self-start rounded-2xl bg-ink px-5 py-3 font-bold text-white">
        ← Zurück zur Karte
      </Link>
    </main>
  );
}
