import { redirect } from "next/navigation";
import { Suspense } from "react";

import { WaterQualityForm } from "@/components/water-quality-form";
import { createClient } from "@/lib/supabase/server";

export default function NewWaterQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ system?: string }>;
}) {
  return (
    <div className="flex-1 w-full flex flex-col items-start gap-6">
      <h1 className="font-bold text-2xl">New water quality reading</h1>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <NewWaterQualityContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewWaterQualityContent({
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

  return <WaterQualityForm systems={systems ?? []} defaultSystemId={system} />;
}
