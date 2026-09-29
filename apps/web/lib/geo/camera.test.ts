import { describe, expect, it } from "vitest";
import { fitCamera } from "./camera";

const none = { top: 0, right: 0, bottom: 0, left: 0 };

describe("fitCamera", () => {
  it("fits a whole-world-width box into a 512 px map at zoom 0", () => {
    const { center, zoom } = fitCamera([-180, -60, 180, 60], 512, 2000, none);
    expect(zoom).toBeCloseTo(0, 5);
    expect(center[0]).toBeCloseTo(0);
    expect(center[1]).toBeCloseTo(0);
  });

  it("uses the Mercator midpoint and the tighter axis", () => {
    // A Zürich postcode-sized box on a phone with header + compact sheet.
    const b = [8.5, 47.36, 8.54, 47.39] as const;
    const pad = { top: 150, right: 20, bottom: 380, left: 20 };
    const { center, zoom } = fitCamera(b, 412, 915, pad);
    expect(center[0]).toBeCloseTo(8.52);
    expect(center[1]).toBeGreaterThan(47.374);
    expect(center[1]).toBeLessThan(47.376);
    // Less room → lower zoom; the free area here is 372 × 385 px.
    expect(zoom).toBeLessThan(fitCamera(b, 412, 915, none).zoom);
    expect(zoom).toBeGreaterThan(12);
  });

  it("stays sane when the padding leaves no room, and respects maxZoom", () => {
    const b = [8.5, 47.36, 8.54, 47.39] as const;
    expect(Number.isFinite(fitCamera(b, 400, 600, { top: 400, right: 0, bottom: 400, left: 0 }).zoom)).toBe(true);
    expect(fitCamera([8.5, 47.37, 8.5001, 47.3701], 800, 800, none).zoom).toBe(16);
  });
});
