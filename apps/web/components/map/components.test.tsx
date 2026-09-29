import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KREISE, PLZ } from "geo/data";
import { nearby, resolveAnchor } from "geo";
import { toPoints } from "@/lib/geo/group";
import type { StationFeature } from "@/lib/geo/types";
import { NearbyPanel } from "./NearbyPanel";
import { Sheet } from "./Sheet";
import { StationSheet, formatDate } from "./StationSheet";
import { TypeFilterChips } from "./TypeFilterChips";

const st = (id: string, kind: StationFeature["properties"]["kind"], lng: number, lat: number, extra = {}): StationFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: { id, kind, name: id, kreis: 4, plz: "8004", ...extra },
});

const mrh = st("Stauffacher", "mrh", 8.5287, 47.3735, {
  address: "St. Jakobstrasse 29",
  nextDates: ["2026-10-02", "2026-10-06"],
  servesPlz: ["8003", "8004"],
});

describe("Sheet", () => {
  it("opens compact on phones; the handle toggles expanded", async () => {
    render(
      <Sheet title="Test" onClose={() => {}} testId="sheet">
        <p>Inhalt</p>
      </Sheet>,
    );
    const handle = screen.getByTestId("sheet-handle");
    expect(handle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("sheet")).toHaveStyle({ "--sheet-h": "40dvh" });
    await userEvent.click(handle);
    expect(handle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("sheet")).toHaveStyle({ "--sheet-h": "85dvh" });
    await userEvent.click(handle);
    expect(handle).toHaveAttribute("aria-expanded", "false");
  });
});

describe("StationSheet", () => {
  it("shows name, dates with MRH hours, the pickup CTA and the official-stop badge", () => {
    render(<StationSheet station={mrh} onClose={() => {}} distance={180} anchorPlz="8004" />);
    const dialog = screen.getByRole("dialog", { name: "Stauffacher" });
    expect(within(dialog).getByText(formatDate("2026-10-02"))).toBeInTheDocument();
    expect(within(dialog).getAllByText("15–19 Uhr").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("180 m entfernt")).toBeInTheDocument();
    expect(within(dialog).getByText("Offizieller Standort für PLZ 8004")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Wir bringen/ })).toHaveAttribute(
      "href",
      "/abholen?station=Stauffacher",
    );
  });

  it("closes on Escape and goes back to the list", async () => {
    const onClose = vi.fn();
    const onBack = vi.fn();
    render(<StationSheet station={mrh} onClose={onClose} onBack={onBack} />);
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Liste" }));
    expect(onBack).toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows Recyclinghof opening hours", () => {
    const rh = st("Recyclinghof Werdhölzli", "recyclinghof", 8.4814, 47.3978, { hours: { mo: "13:00–19:00", sa: "07:30–14:00" } });
    render(<StationSheet station={rh} onClose={() => {}} />);
    expect(screen.getByText("Öffnungszeiten")).toBeInTheDocument();
    expect(screen.getByText("07:30–14:00")).toBeInTheDocument();
  });
});

describe("NearbyPanel", () => {
  const stations = [
    mrh,
    st("Helvetiaplatz", "hazmat", 8.5256, 47.3764, { nextDates: ["2026-10-09"], hours: { note: "8 bis 11.30 Uhr" } }),
    st("Idaplatz", "sammelstelle", 8.522, 47.3708, { kreis: 3, plz: "8003", materials: ["glass", "metal"] }),
    st("Oerlikon", "mrh", 8.5445, 47.4105, { kreis: 11, nextDates: ["2026-10-05"] }),
  ];
  const resolved = resolveAnchor({ type: "point", lng: 8.5287, lat: 47.3735, source: "map" }, KREISE, PLZ)!;
  const results = nearby(toPoints(stations), resolved, { mode: "nearby", radius: 1000 });

  const renderPanel = (props: Partial<Parameters<typeof NearbyPanel>[0]> = {}) =>
    render(
      <NearbyPanel
        resolved={resolved}
        results={results}
        radius={1000}
        today="2026-10-01"
        calendar={{ plz: "8004", next: { paper: ["2026-10-07"], cardboard: ["2026-10-08"] } }}
        picker={(trailing) => trailing}
        onRadiusChange={() => {}}
        previewId={null}
        onPreviewStation={() => {}}
        onClose={() => {}}
        {...props}
      />,
    );

  it("lists upcoming dates grouped by distance band, with the kerbside calendar", () => {
    renderPanel();
    expect(screen.getByRole("dialog", { name: "Gewählter Punkt" })).toBeInTheDocument();
    expect(screen.getByText(/Kreis 4 · 8004/)).toBeInTheDocument();
    const groups = screen.getByTestId("date-groups");
    const sections = within(groups).getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["bis 300 m", "300–600 m"]);
    expect(within(sections[0]).getAllByRole("button")).toHaveLength(2); // Stauffacher's two dates
    expect(within(groups).queryByText(/Oerlikon/)).toBeNull(); // 4 km away
    expect(screen.getByTestId("kerbside")).toHaveTextContent("Papier");
    expect(within(sections[0]).getAllByText("offiziell für 8004")).toHaveLength(2);
  });

  it("switches to places (incl. Sammelstellen across the Kreis border); a tap marks the station", async () => {
    const onPreview = vi.fn();
    renderPanel({ onPreviewStation: onPreview });
    await userEvent.click(screen.getByRole("tab", { name: /Orte/ }));
    const groups = screen.getByTestId("place-groups");
    expect(within(groups).getByText("Idaplatz")).toBeInTheDocument();
    expect(screen.queryByTestId("tap-again")).toBeNull();
    await userEvent.click(within(groups).getByText("Idaplatz"));
    expect(onPreview).toHaveBeenCalledWith("Idaplatz");
  });

  it("shows the marked station's row as pressed, with a 'tap again' hint", async () => {
    renderPanel({ previewId: "Idaplatz" });
    await userEvent.click(screen.getByRole("tab", { name: /Orte/ }));
    const row = within(screen.getByTestId("place-groups")).getByRole("button", { pressed: true });
    expect(row).toHaveTextContent("Idaplatz");
    expect(row).toHaveTextContent("Nochmals tippen für Details");
  });

  it("titles the list by tab, has no scope toggle, and offers a way out of empty results", async () => {
    const onRadius = vi.fn();
    renderPanel({ results: [], onRadiusChange: onRadius, radius: 500 });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByTestId("list-title")).toHaveTextContent("Termine: Mobiler Recyclinghof");
    await userEvent.click(screen.getByRole("tab", { name: /Orte/ }));
    expect(screen.getByTestId("list-title")).toHaveTextContent("Alle Entsorgungsorte in der Nähe");
    await userEvent.click(screen.getByRole("button", { name: "Auf 2 km erweitern" }));
    expect(onRadius).toHaveBeenCalledWith(2000);
  });
});

describe("TypeFilterChips", () => {
  it("reflects state with aria-pressed and toggles", async () => {
    const onToggle = vi.fn();
    render(<TypeFilterChips active={["mrh"]} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "Mobiler Recyclinghof" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sonderabfall" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: "Sammelstelle" }));
    expect(onToggle).toHaveBeenCalledWith("sammelstelle");
    expect(screen.getByRole("button", { name: "Recyclinghof" })).toBeInTheDocument();
  });
});

it("formatDate renders Swiss German dates", () => {
  expect(formatDate("2026-10-02")).toMatch(/2\. Oktober/);
});
