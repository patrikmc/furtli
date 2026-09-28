import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bandLabel, formatDistance } from "geo";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { LangProvider, useLang } = await import("@/components/i18n/LangProvider");
const { LangToggle } = await import("@/components/i18n/LangToggle");
const { SubscribeForm } = await import("@/components/subscribe/SubscribeForm");
const { proxy } = await import("@/proxy");
const { formatDate, localizeTimeText } = await import("./format");
const { timeWindow } = await import("@/lib/geo/kinds");
const { UI_TEXT } = await import("./ui");

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "furtli_lang=; max-age=0; path=/";
  refresh.mockClear();
});

describe("formatting", () => {
  it("dates, distances, bands and opening times per language", () => {
    expect(formatDate("2026-10-02", "de")).toMatch(/2\. Oktober/);
    expect(formatDate("2026-10-02", "en")).toMatch(/2 October/);
    expect(formatDistance(1234, "de")).toBe("1,2 km");
    expect(formatDistance(1234, "en")).toBe("1.2 km");
    expect(bandLabel(0, null, "en")).toBe("up to 300 m");
    expect(bandLabel(1, "Kreis 4", "en")).toBe("300–600 m outside");
    expect(bandLabel(-1, null, "en")).toBe("In this area");
    expect(localizeTimeText("15–19 Uhr", "en")).toBe("15:00–19:00");
    expect(localizeTimeText("8 bis 11.30 Uhr", "en")).toBe("8:00–11:30");
    expect(localizeTimeText("8 bis 11.30 Uhr", "de")).toBe("8 bis 11.30 Uhr");
    expect(timeWindow("mrh", null, "2026-10-03", "en")).toBe("10:00–14:00");
  });

  it("English has every text German has", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(UI_TEXT.en).sort()).toEqual(keys(UI_TEXT.de).sort());
  });
});

describe("language toggle", () => {
  function Probe() {
    const { t } = useLang();
    return <p>{t.map.startTitle}</p>;
  }

  it("switches the site language, stores it in the cookie and refreshes server parts", async () => {
    const user = userEvent.setup();
    render(
      <LangProvider initialLang="de">
        <LangToggle />
        <Probe />
      </LangProvider>,
    );
    expect(screen.getByText("Was gibt's in deiner Nähe?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deutsch" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByText("What's near you?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(document.cookie).toContain("furtli_lang=en");
    expect(document.documentElement.lang).toBe("en");
    expect(refresh).toHaveBeenCalled();
  });

  it("the subscribe form follows the site language, including the email language", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <LangProvider initialLang="de">
        <LangToggle />
        <SubscribeForm plz="8004" source="nearby" />
      </LangProvider>,
    );
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByTestId("subscribe-open"));
    expect(screen.getByRole("combobox", { name: "Email language" })).toHaveValue("en");
    expect(screen.getByLabelText("Organic waste")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("you@email.ch"), "anna@example.ch");
    await user.click(screen.getByRole("checkbox", { name: /reminders of my collection dates/ }));
    await user.click(screen.getByRole("button", { name: "Remind me" }));
    expect(await screen.findByTestId("subscribe-done")).toHaveTextContent("We've sent an email to anna@example.ch");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ lang: "en", consentLang: "en" });
  });

  it("a language picked in the form wins over the site language", async () => {
    const user = userEvent.setup();
    render(
      <LangProvider initialLang="en">
        <SubscribeForm plz="8004" source="nearby" />
      </LangProvider>,
    );
    await user.click(screen.getByTestId("subscribe-open"));
    const select = screen.getByRole("combobox", { name: "Email language" });
    await user.selectOptions(select, "de");
    expect(select).toHaveValue("de");
  });
});

describe("proxy", () => {
  it("?lang=en stores the language, for this request and the next ones", async () => {
    vi.stubEnv("SITE_PASSWORD", "");
    const res = await proxy(new NextRequest("https://furtli.ch/abo/bestaetigen?t=x&lang=en"));
    expect(res.cookies.get("furtli_lang")?.value).toBe("en");
    // Forwarded to the page render of the same request:
    expect(res.headers.get("x-middleware-request-cookie") ?? res.headers.get("x-middleware-override-headers")).toBeTruthy();
    const none = await proxy(new NextRequest("https://furtli.ch/?lang=xx"));
    expect(none.cookies.get("furtli_lang")).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
