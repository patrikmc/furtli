import type { Metadata } from "next";
import CompareView from "@/components/compare/CompareView";
import { allBasemaps, maptilerBasemap } from "@/lib/map-config";

export const metadata: Metadata = {
  title: "Kartenvergleich",
  robots: { index: false }, // internal comparison view
};

/**
 * Side-by-side base-map comparison: /compare?left=swisstopo-light&right=maptiler-dataviz
 * Defaults: swisstopo Light vs MapTiler Dataviz (or swisstopo Base without a MapTiler key).
 */
export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const sp = await searchParams;
  const ids = allBasemaps().map((b) => b.id);
  const pick = (v: unknown, fallback: string) => (typeof v === "string" && ids.includes(v) ? v : fallback);
  const defaultRight = maptilerBasemap(null)?.id ?? "swisstopo-base";
  return <CompareView leftId={pick(sp.left, "swisstopo-light")} rightId={pick(sp.right, defaultRight)} />;
}
