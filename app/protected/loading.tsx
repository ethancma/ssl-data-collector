import { Tile } from "@/components/ui/app-layout";

// Shown while any protected page renders on the server. Static on purpose: no data or
// profile reads, so it costs nothing on the Worker.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading page" className="mx-auto w-full min-w-0 max-w-7xl space-y-6">
      <div className="max-w-3xl space-y-3">
        <div className="h-9 w-2/3 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-5 w-1/2 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      </div>
      <Tile className="space-y-2 p-4 sm:p-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-11 animate-pulse rounded-xl bg-background/60 motion-reduce:animate-none" />
        ))}
      </Tile>
    </div>
  );
}
