import { Suspense } from "react";
import IseauCompare from "@/components/iseau/iseau-compare";
import { fetchIseauData } from "../data";

export default async function ISeaUComparePage() {
  const result = await fetchIseauData();
  if ("error" in result) {
    return <p className="text-sm text-red-500" role="alert">ISeaU could not be loaded: {result.error}</p>;
  }
  return <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading ISeaU…</p>}>
    <IseauCompare data={result.data} />
  </Suspense>;
}
