"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { readAttribution } from "@/lib/analytics/attribution";
import { useLang } from "@/components/i18n/LangProvider";
import { track } from "@/lib/analytics/umami";
import { TYPE_LABELS } from "@/lib/email/copy";
import type { Lang } from "@/lib/i18n/lang";
import { CONSENT_TEXT, KERBSIDE_TOPICS, STATION_TOPICS, type Topic } from "@/lib/subscriptions/topics";


const DEFAULT_TOPICS: Topic[] = ["paper", "cardboard", "mrh"];
const consentLabel = (lang: Lang) => CONSENT_TEXT[lang].replace(/\s*\(v\d+\)$/, "");

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
  const { lang: siteLang, t: ui } = useLang();
  const t = ui.subscribe;
  // Email language: follows the site language (DE/EN toggle) until picked here.
  const [pickedLang, setLang] = useState<Lang | null>(null);
  const lang = pickedLang ?? siteLang;
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
          consentLang: siteLang,
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
        <p className="font-bold">{t.doneTitle}</p>
        <p className="mt-0.5">
          {t.doneBefore}
          <span className="font-bold">{email}</span>
          {t.doneAfter}
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
          <span className="block leading-tight font-bold">{t.openTitle}</span>
          <span className="mt-0.5 block text-sm text-ink/65">
            {station ? t.openStation : t.openPlz(plz!)}
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
      aria-label={t.openTitle}
    >
      <p className="flex items-center gap-2 font-bold">
        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange text-white">
          <BellIcon still />
        </span>
        {station ? t.formTitleStation(station.name) : t.formTitlePlz(plz!)}
      </p>

      {!station && (
        <fieldset>
          <legend className="mb-1 text-xs font-bold tracking-wide text-ink/60 uppercase">{t.what}</legend>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {topicOptions.map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" checked={topics.includes(k)} onChange={() => toggle(k)} className="accent-orange" />
                {TYPE_LABELS[siteLang][k]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={digest} onChange={(e) => setDigest(e.target.checked)} className="accent-orange" />
        {t.digest}
      </label>

      <div className="flex gap-2">
        <label htmlFor={`${id}-email`} className="sr-only">
          {t.email}
        </label>
        <input
          id={`${id}-email`}
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder={t.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-ink/15 px-3 py-2 text-base"
        />
        <select
          aria-label={t.emailLang}
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
          {consentLabel(siteLang)}{" "}
          <Link href="/datenschutz" className="underline" target="_blank">
            {t.privacy}
          </Link>
        </span>
      </label>

      {status === "error" && (
        <p role="alert" className="text-sm font-bold text-orange">
          {t.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={status === "sending" || !topics.length || !consent}
          className="rounded-xl bg-orange px-4 py-2 font-bold text-white disabled:opacity-50"
        >
          {status === "sending" ? t.sending : t.submit}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink/60 underline">
          {t.cancel}
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
