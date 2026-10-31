import { Suspense } from "react";
import IseauLineup from "@/components/iseau/iseau-lineup";
import { fetchIseauData } from "./data";

export default async function ISeaUPage() {
  const result = await fetchIseauData();
  if ("error" in result) {
    return <p className="text-sm text-red-500" role="alert">ISeaU could not be loaded: {result.error}</p>;
  }
  return <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading ISeaU…</p>}>
    <IseauLineup data={result.data} />
  </Suspense>;
}
