"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { readAttribution } from "@/lib/analytics/attribution";
import { track } from "@/lib/analytics/umami";
import { CONSENT_TEXT, KERBSIDE_TOPICS, STATION_TOPICS, type Topic } from "@/lib/subscriptions/topics";

const LABELS: Record<Topic, string> = {
  paper: "Papier",
  cardboard: "Karton",
  organic: "Bioabfall",
  waste: "Kehricht",
  mrh: "Mobiler Recyclinghof",
  hazmat: "Sonderabfallmobil",
};

const DEFAULT_TOPICS: Topic[] = ["paper", "cardboard", "mrh"];
const consentLabel = CONSENT_TEXT.de.replace(/\s*\(v\d+\)$/, "");

type Status = "idle" | "sending" | "done" | "error";

/**
 * "Remind me by email", collapsed into one button until opened.
 * - With a postcode: pick kerbside collections and the MRH/hazmat stops for it.
 * - With a station (MRH / Sonderabfallmobil): reminders for that stop only.
 * Double opt-in: the server only sends a confirmation email.
 */
export function SubscribeForm({
  plz,
  station,
  source,
}: {
  plz: string | null;
  station?: { id: string; name: string; kind: Topic } | null;
  /** Where the form is shown, stored with the subscriber ("nearby", "station"). */
  source: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [topics, setTopics] = useState<Topic[]>(station ? [station.kind] : DEFAULT_TOPICS);
  const [digest, setDigest] = useState(false);
  const [consent, setConsent] = useState(false);
  const [lang, setLang] = useState<"de" | "en">(() =>
    typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en") ? "en" : "de",
  );
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  if (!plz && !station) return null;

  const toggle = (t: Topic) => setTopics((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!topics.length || !consent) return;
    setStatus("sending");
    const attribution = readAttribution();
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          lang,
          plz: station ? null : plz,
          stationId: station?.id ?? null,
          topics,
          reminders: true,
          digest,
          consent: true,
          source,
          attribution,
          website,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("done");
      track("subscribe_submit", {
        source,
        topics: topics.join(","),
        digest,
        utm_source: attribution.utmSource ?? (attribution.referrer ? "referral" : "direct"),
        ...(attribution.utmCampaign ? { utm_campaign: attribution.utmCampaign } : {}),
      });
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div data-testid="subscribe-done" className="rounded-2xl bg-mint px-4 py-3 text-sm text-ink">
        <p className="font-bold">Fast geschafft!</p>
        <p className="mt-0.5">
          Wir haben dir eine E-Mail an <span className="font-bold">{email}</span> geschickt. Bitte bestätige den Link
          darin, erst dann erinnern wir dich.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="subscribe-open"
        onClick={() => {
          setOpen(true);
          track("subscribe_open", { source });
        }}
        className="group flex w-full items-center gap-3 rounded-2xl bg-orange/10 px-3 py-2.5 text-left text-ink ring-1 ring-orange/30 transition hover:bg-orange/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange active:scale-[0.99]"
      >
        <span className="min-w-0 flex-1">
          <span className="block leading-tight font-bold">Erinnerung per E-Mail</span>
          <span className="mt-0.5 block text-sm text-ink/65">
            {station ? `Am Vorabend jedes Termins hier` : `Am Vorabend von Abfuhr und Recyclinghof in ${plz}`}
          </span>
        </span>
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-orange text-white transition group-hover:scale-105"
        >
          <BellIcon />
        </span>
      </button>
    );
  }

  const topicOptions: Topic[] = [...KERBSIDE_TOPICS, ...STATION_TOPICS];
  return (
    <form
      data-testid="subscribe-form"
      onSubmit={submit}
      className="space-y-3 rounded-2xl bg-white px-3 py-3 text-sm text-ink ring-1 ring-orange/30"
      aria-label="Erinnerung per E-Mail"
    >
      <p className="flex items-center gap-2 font-bold">
        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange text-white">
          <BellIcon still />
        </span>
        Erinnerung per E-Mail {station ? `für ${station.name}` : `für PLZ ${plz}`}
      </p>

      {!station && (
        <fieldset>
          <legend className="mb-1 text-xs font-bold tracking-wide text-ink/60 uppercase">Woran erinnern?</legend>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {topicOptions.map((t) => (
              <label key={t} className="flex items-center gap-2">
                <input type="checkbox" checked={topics.includes(t)} onChange={() => toggle(t)} className="accent-orange" />
                {LABELS[t]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={digest} onChange={(e) => setDigest(e.target.checked)} className="accent-orange" />
        Zusätzlich: Wochenübersicht am Sonntagabend
      </label>

      <div className="flex gap-2">
        <label htmlFor={`${id}-email`} className="sr-only">
          E-Mail-Adresse
        </label>
        <input
          id={`${id}-email`}
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="deine@email.ch"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-ink/15 px-3 py-2 text-base"
        />
        <select
          aria-label="Sprache der E-Mails"
          value={lang}
          onChange={(e) => setLang(e.target.value === "en" ? "en" : "de")}
          className="rounded-xl border border-ink/15 bg-white px-2 text-sm"
        >
          <option value="de">DE</option>
          <option value="en">EN</option>
        </select>
      </div>

      {/* Honeypot for bots; hidden from people and screen readers. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />

      <label className="flex items-start gap-2 text-xs text-ink/75">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 accent-orange"
        />
        <span>
          {consentLabel}{" "}
          <Link href="/datenschutz" className="underline" target="_blank">
            Datenschutz
          </Link>
        </span>
      </label>

      {status === "error" && (
        <p role="alert" className="text-sm font-bold text-orange">
          Das hat nicht geklappt. Bitte versuch es nochmals.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "sending" || !topics.length || !consent}
          className="rounded-xl bg-orange px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          {status === "sending" ? "Sende …" : "Erinnere mich"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink/60 underline">
          Abbrechen
        </button>
      </div>
    </form>
  );
}

/** Bell pictogram; rings twice on first render unless the user prefers reduced motion. */
function BellIcon({ still = false }: { still?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 origin-top ${still ? "h-4 w-4" : "motion-safe:animate-bell"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
