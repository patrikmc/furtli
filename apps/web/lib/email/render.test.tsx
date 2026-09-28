// @vitest-environment node
import { describe, expect, it } from "vitest";
import ConfirmSubscription from "@/emails/ConfirmSubscription";
import Reminder from "@/emails/Reminder";
import WeeklyDigest from "@/emails/WeeklyDigest";
import Welcome from "@/emails/Welcome";
import { renderConfirm, renderDigest, renderReminder, renderWelcome } from "./render";

describe("email templates", () => {
  it("confirmation: subject, button link, no unsubscribe footer yet", async () => {
    const e = await renderConfirm({ ...ConfirmSubscription.PreviewProps, isUpdate: false });
    expect(e.subject).toBe("Bitte bestätige deine Erinnerungen");
    expect(e.html).toContain("https://furtli.ch/abo/bestaetigen?t=preview");
    expect(e.html).not.toContain("Abmelden");
    expect(e.text).toContain("Ja, erinnere mich");
  });

  it("reminder: subject lists tomorrow's items, pickup CTA and unsubscribe link", async () => {
    const e = await renderReminder(Reminder.PreviewProps);
    expect(e.subject).toBe("Morgen: Karton und Mobiler Recyclinghof");
    expect(e.html).toContain("Freitag, 30. Oktober");
    expect(e.html).toContain("/abholen?station=mrh-stauffacher");
    expect(e.html).toContain("/abo/abmelden?t=preview");
    expect(e.html).not.toMatch(/undefined|null/);
  });

  it("reminders and weekly overviews end with the whole subscription (why you get this)", async () => {
    const r = await renderReminder(Reminder.PreviewProps);
    const d = await renderDigest({ ...WeeklyDigest.PreviewProps, from: "2026-10-26", to: "2026-11-01" });
    for (const e of [r, d]) {
      expect(e.text).toContain("Dein Abo");
      expect(e.text).toContain("Postleitzahl 8004: Karton, Papier, Mobiler Recyclinghof");
      expect(e.text).toContain("Standort: Stauffacher: Mobiler Recyclinghof");
      expect(e.text).toContain("Wochenübersicht am Sonntagabend");
    }
  });

  it("confirming an addition shows the full subscription with the new part marked", async () => {
    const e = await renderConfirm(ConfirmSubscription.PreviewProps);
    expect(e.subject).toBe("Bitte bestätige deine neuen Einstellungen");
    expect(e.text).toContain("Postleitzahl 8004: Karton, Papier");
    expect(e.text).toContain("Standort: Stauffacher: Mobiler Recyclinghof (neu)");
  });

  it("English reminder", async () => {
    const e = await renderReminder({ ...Reminder.PreviewProps, lang: "en" });
    expect(e.subject).toBe("Tomorrow: Cardboard and Mobile recycling point");
    expect(e.text).toContain("15:00–19:00"); // city hours "15–19 Uhr" in English
    expect(e.text).not.toContain("Uhr");
    expect(e.html).toContain("Unsubscribe");
  });

  it("digest and welcome render with their subjects", async () => {
    const d = await renderDigest({ ...WeeklyDigest.PreviewProps, from: "2026-10-26", to: "2026-11-01" });
    expect(d.subject).toMatch(/^Deine Woche: /);
    expect(d.html).toContain("Mittwoch, 28. Oktober");
    const w = await renderWelcome(Welcome.PreviewProps);
    expect(w.subject).toBe("Du bist dabei: deine Erinnerungen sind aktiv");
    expect(w.text).toContain("Karton");
  });
});
