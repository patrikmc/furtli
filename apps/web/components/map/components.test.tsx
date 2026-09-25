import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StationSheet, formatDate } from "./StationSheet";
import { TypeFilterChips } from "./TypeFilterChips";
import type { StationFeature } from "@/lib/geo/types";

const mrh: StationFeature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [8.5287, 47.3735] },
  properties: {
    id: "mrh-stauffacher",
    kind: "mrh",
    name: "Stauffacher",
    kreis: 4,
    plz: "8004",
    nextDates: ["2026-10-02", "2026-10-06"],
    placeholder: true,
  },
};

describe("StationSheet", () => {
  it("shows name, dates and the pickup CTA for an MRH stop", () => {
    render(<StationSheet mode="station" station={mrh} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Stauffacher" })).toBeInTheDocument();
    expect(screen.getByText(formatDate("2026-10-02"))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Wir bringen/ })).toHaveAttribute(
      "href",
      "/abholen?station=mrh-stauffacher",
    );
    expect(screen.getByText(/Beispieldaten/)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<StationSheet mode="station" station={mrh} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("lists a Kreis's stations and selects one", async () => {
    const onSelect = vi.fn();
    render(<StationSheet mode="kreis" kreis={4} stations={[mrh]} onSelectStation={onSelect} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Stauffacher/ }));
    expect(onSelect).toHaveBeenCalledWith("mrh-stauffacher");
  });
});

describe("TypeFilterChips", () => {
  it("reflects state with aria-pressed and toggles", async () => {
    const onToggle = vi.fn();
    render(<TypeFilterChips active={["mrh"]} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: /Recyclinghof/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Sonderabfall/ })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(screen.getByRole("button", { name: /Sammelstelle/ }));
    expect(onToggle).toHaveBeenCalledWith("sammelstelle");
  });
});

it("formatDate renders Swiss German dates", () => {
  expect(formatDate("2026-10-02")).toMatch(/2\. Oktober/);
});
