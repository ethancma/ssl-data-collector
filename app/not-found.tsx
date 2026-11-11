import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center px-6 py-16">
      <section
        aria-labelledby="not-found-title"
        className="mx-auto flex w-full max-w-3xl flex-col items-start"
      >
        <svg
          aria-hidden="true"
          className="mb-8 h-20 w-20 text-primary"
          fill="none"
          viewBox="0 0 120 120"
        >
          <path
            d="M60 12c-5 11-8 22-10 33-10-6-21-11-34-13 6 12 14 21 25 27-11 5-20 14-26 27 14-2 26-7 35-15 1 12 5 24 10 36 5-12 9-24 10-36 9 8 21 13 35 15-6-13-15-22-26-27 11-6 19-15 25-27-13 2-24 7-34 13-2-11-5-22-10-33Z"
            stroke="currentColor"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <circle cx="60" cy="58" r="4" fill="currentColor" />
        </svg>
        <p className="mb-3 text-sm text-muted-foreground">404</p>
        <h1
          className="text-3xl font-semibold tracking-tight sm:text-4xl"
          id="not-found-title"
        >
          This page doesn’t exist.
        </h1>
        <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
          This address doesn’t match a page in the lab log. Check it for a typo
          or return to the start.
        </p>
        <Button asChild className="mt-8">
          <Link href="/">Return to the start</Link>
        </Button>
      </section>
    </main>
  );
}
