import type { Metadata } from "next";
import MapShell from "@/components/map/MapShell";
import { MissingKeyNotice } from "@/components/compare/MissingKeyNotice";
import { CITY_PLZ } from "geo/data";
import { parseSearchParams } from "@/lib/geo/anchor";
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
      initialSearch={parseSearchParams(sp, CITY_PLZ)}
      initialStationId={station}
      cityPlz={CITY_PLZ}
      basemap={basemap}
      showBasemapBadge
    />
  );
}
