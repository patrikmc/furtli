import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscribeForm } from "./SubscribeForm";

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("SubscribeForm", () => {
  it("sends postcode, topics, consent and the stored first-touch attribution", async () => {
    window.sessionStorage.setItem(
      "furtli.attribution",
      JSON.stringify({ utmSource: "reddit", utmCampaign: "w2-launch", landingPath: "/" }),
    );
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    const umami = { track: vi.fn() };
    vi.stubGlobal("umami", umami);
    const user = userEvent.setup();

    render(<SubscribeForm plz="8004" source="nearby" />);
    await user.click(screen.getByTestId("subscribe-open"));
    await user.click(screen.getByLabelText("Bioabfall"));
    await user.type(screen.getByPlaceholderText("deine@email.ch"), "anna@example.ch");
    const submit = screen.getByRole("button", { name: "Erinnere mich" });
    expect(submit).toBeDisabled(); // consent not given yet
    await user.click(screen.getByRole("checkbox", { name: /Erinnerungen an meine Entsorgungstermine/ }));
    await user.click(submit);

    expect(await screen.findByTestId("subscribe-done")).toHaveTextContent("anna@example.ch");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      email: "anna@example.ch",
      plz: "8004",
      stationId: null,
      topics: ["paper", "cardboard", "mrh", "organic"],
      consent: true,
      source: "nearby",
      attribution: { utmSource: "reddit", utmCampaign: "w2-launch" },
    });
    expect(umami.track).toHaveBeenCalledWith("subscribe_open", { source: "nearby" });
    expect(umami.track).toHaveBeenCalledWith(
      "subscribe_submit",
      expect.objectContaining({ source: "nearby", utm_source: "reddit", utm_campaign: "w2-launch" }),
    );
  });

  it("for a station, subscribes to that stop only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SubscribeForm plz={null} station={{ id: "mrh-a", name: "Stauffacher", kind: "mrh" }} source="station" />);
    await user.click(screen.getByTestId("subscribe-open"));
    expect(screen.queryByLabelText("Karton")).toBeNull();
    await user.type(screen.getByPlaceholderText("deine@email.ch"), "b@example.ch");
    await user.click(screen.getByRole("checkbox", { name: /Entsorgungstermine/ }));
    await user.click(screen.getByRole("button", { name: "Erinnere mich" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nicht geklappt");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ plz: null, stationId: "mrh-a", topics: ["mrh"] });
  });
});
