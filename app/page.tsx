import { AuthButton } from "@/components/auth-button";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

const LOG_TYPES = [
  { title: "AM/PM checks", description: "Twice-daily welfare and system checks." },
  { title: "Feeding logs", description: "Food type, quantity, and consumption status." },
  { title: "Water quality", description: "pH, salinity, ammonia, alkalinity, and more." },
  { title: "Health observations", description: "Issue type, severity, and photo evidence." },
  { title: "Chemical additions", description: "Dosing records for every system." },
  { title: "Maintenance", description: "Filter changes, sump flushes, and upkeep." },
] as const;

const SYSTEMS = [
  "Indoor Quarantine",
  "Outdoor Quarantine",
  "Graham",
  "Wholey",
  "Yum Yum",
  "Snack Shack",
  "Larval",
  "Micro-Algae",
] as const;

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    redirect("/protected");
  }

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"}>SSL Data Collection</Link>
            </div>
            {!hasEnvVars ? (
              <span className="text-xs text-muted-foreground">
                Add Supabase env vars to .env.local to enable auth
              </span>
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>

        <section className="w-full max-w-5xl flex flex-col items-center gap-6 text-center px-5 pt-16 pb-12">
          <h1 className="text-4xl font-bold tracking-tight">
            One tool for every system, every log
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            SSL Data Collection is how our staff and volunteers track daily
            operations across 8 lab systems as we grow sunflower sea stars (
            <em>Pycnopodia helianthoides</em>) and protocol species to help
            recover kelp forests.
          </p>
        </section>

        <section className="w-full max-w-5xl px-5 pb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {LOG_TYPES.map((logType) => (
              <Card key={logType.title}>
                <CardHeader>
                  <CardTitle>{logType.title}</CardTitle>
                  <CardDescription>{logType.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="w-full max-w-5xl px-5 pb-20 flex flex-col gap-3 border-t pt-10">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            The 8 lab systems
          </h2>
          <div className="flex flex-wrap gap-2">
            {SYSTEMS.map((system) => (
              <Badge key={system} variant="secondary">
                {system}
              </Badge>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
