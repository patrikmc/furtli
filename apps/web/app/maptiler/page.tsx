import type { Metadata } from "next";
import MapShell from "@/components/map/MapShell";
import { MissingKeyNotice } from "@/components/compare/MissingKeyNotice";
import { parseKreisParam } from "@/lib/geo/kreis";
import { maptilerBasemap } from "@/lib/map-config";

export const metadata: Metadata = {
  title: "Karte (MapTiler)",
  robots: { index: false }, // internal comparison view
};

/**
 * The full map app on a MapTiler base map, for comparison with "/"
 * (swisstopo). Same URL state: /maptiler?style=streets-v2&kreis=4
 */
export default async function MapTilerPage({ searchParams }: PageProps<"/maptiler">) {
  const sp = await searchParams;
  const basemap = maptilerBasemap(typeof sp.style === "string" ? sp.style : null);
  if (!basemap) return <MissingKeyNotice />;
  const station = typeof sp.station === "string" && sp.station.length <= 80 ? sp.station : null;
  return (
    <MapShell
      initialKreis={parseKreisParam(sp.kreis)}
      initialStationId={station}
      basemap={basemap}
      showBasemapBadge
    />
  );
}
