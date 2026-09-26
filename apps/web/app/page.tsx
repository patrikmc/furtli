import { CITY_PLZ } from "geo/data";
import MapShell from "@/components/map/MapShell";
import { parseSearchParams } from "@/lib/geo/anchor";

/**
 * Map overview (entry point). Server component: it only reads the
 * shareable URL state (?at= / ?plz= / ?kreis=, &scope=, &r=, &station=)
 * and hands it to the client-side map shell.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const station = typeof sp.station === "string" && sp.station.length <= 80 ? sp.station : null;
  return <MapShell initialSearch={parseSearchParams(sp, CITY_PLZ)} initialStationId={station} cityPlz={CITY_PLZ} />;
}
