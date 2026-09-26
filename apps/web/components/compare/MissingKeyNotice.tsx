import Link from "next/link";

/** Shown on /maptiler and /compare when NEXT_PUBLIC_MAPTILER_KEY isn't set. */
export function MissingKeyNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-display text-3xl font-bold text-ink">MapTiler key missing</h1>
      <p className="text-ink/75">
        To compare base maps, add a MapTiler API key and restart the dev server:
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-ink/80">
        <li>
          Create a free key at{" "}
          <a className="underline" href="https://cloud.maptiler.com/account/keys/" target="_blank" rel="noopener">
            cloud.maptiler.com → Account → Keys
          </a>
          . Under <em>Allowed HTTP origins</em>, add <code>localhost</code> (and your Vercel domains later).
        </li>
        <li>
          In <code>apps/web/.env.local</code>: <code className="break-all">NEXT_PUBLIC_MAPTILER_KEY=…</code>
        </li>
        <li>
          Restart <code>pnpm dev</code> (NEXT_PUBLIC_ values are read at startup/build).
        </li>
      </ol>
      <p className="text-sm text-ink/60">
        The free plan is non-commercial (5,000 map sessions/month) and requires the MapTiler logo; see the map view spec,
        section 3.
      </p>
      <Link href="/" className="self-start rounded-2xl bg-ink px-5 py-3 font-bold text-white">
        ← Back to the swisstopo map
      </Link>
    </main>
  );
}
