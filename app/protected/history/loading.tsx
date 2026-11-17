import { PageHeader, Tile } from "@/components/ui/app-layout";
import { RowsSkeleton } from "@/components/history/ui";

export default function Loading() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6">
      <PageHeader title="History" description="Loading entries." />
      <Tile className="p-4 sm:p-6">
        <RowsSkeleton />
      </Tile>
    </div>
  );
}
