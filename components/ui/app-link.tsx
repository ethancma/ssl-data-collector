import Link from "next/link";
import type { ComponentProps } from "react";

export { useLinkStatus } from "next/link";

// Every prefetch is a full server render on the Worker, and bursts of them hit the
// Workers CPU limit, so links prefetch only when a caller opts in.
export function AppLink({ prefetch = false, ...props }: ComponentProps<typeof Link>) {
  return <Link prefetch={prefetch} {...props} />;
}
