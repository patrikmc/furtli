import MapShell from "@/components/map/MapShell";
import { parseKreisParam } from "@/lib/geo/kreis";

/**
 * Map overview (entry point). Server component: it only reads the
 * shareable URL state (?kreis=4&station=mrh-stauffacher) and hands it to
 * the client-side map shell.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const station = typeof sp.station === "string" && sp.station.length <= 80 ? sp.station : null;
  return <MapShell initialKreis={parseKreisParam(sp.kreis)} initialStationId={station} />;
}
