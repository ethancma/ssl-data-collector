import { SystemsPageClient } from "@/components/systems/systems-page-client";

import { fetchAllSystemsDetailData } from "./data";

export default async function SystemsPage() {
  const { dataBySlug, error } = await fetchAllSystemsDetailData();
  if (error) {
    return (
      <p className="text-sm text-red-500" role="alert">
        Systems could not be loaded: {error}
      </p>
    );
  }

  if (Object.keys(dataBySlug).length === 0) {
    return (
      <p className="rounded-md border p-6 text-sm text-muted-foreground">
        No systems are configured.
      </p>
    );
  }

  return <SystemsPageClient dataBySlug={dataBySlug} />;
}

