import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ChemicalAdditionForm } from "@/components/chemical-addition-form";
import { createClient } from "@/lib/supabase/server";

export default function NewChemicalAdditionPage({
  searchParams,
}: {
  searchParams: Promise<{ system?: string }>;
}) {
  return (
    <div className="flex-1 w-full flex flex-col items-start gap-6">
      <h1 className="font-bold text-2xl">New chemical addition</h1>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <NewChemicalAdditionContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewChemicalAdditionContent({
  searchParams,
}: {
  searchParams: Promise<{ system?: string }>;
}) {
  const supabase = await createClient();
  const { data: systems, error } = await supabase
    .from("systems")
    .select("id, name")
    .order("name");

  if (error) {
    redirect("/protected/today");
  }

  const { system } = await searchParams;

  return <ChemicalAdditionForm systems={systems ?? []} defaultSystemId={system} />;
}
