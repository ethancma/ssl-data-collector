import { redirect } from "next/navigation";

import { DailyCheckForm } from "@/components/daily-check-form";
import { CHECK_TYPES } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/server";

export default async function NewDailyCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ system?: string; type?: string }>;
}) {
  const supabase = await createClient();
  const { data: systems, error } = await supabase
    .from("systems")
    .select("id, name")
    .order("name");

  if (error) {
    redirect("/protected/today");
  }

  const { system, type } = await searchParams;
  const defaultCheckType = CHECK_TYPES.find((t) => t === type);

  return (
    <div className="flex-1 w-full flex flex-col items-start gap-6">
      <h1 className="font-bold text-2xl">New daily check</h1>
      <DailyCheckForm
        systems={systems ?? []}
        defaultSystemId={system}
        defaultCheckType={defaultCheckType}
      />
    </div>
  );
}
