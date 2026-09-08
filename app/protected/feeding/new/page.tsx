import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FeedingLogForm } from "@/components/feeding-log-form";
import { createClient } from "@/lib/supabase/server";

export default function NewFeedingLogPage() {
  return (
    <div className="flex-1 w-full flex flex-col items-start gap-6">
      <h1 className="font-bold text-2xl">New feeding log</h1>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <NewFeedingLogContent />
      </Suspense>
    </div>
  );
}

async function NewFeedingLogContent() {
  const supabase = await createClient();
  const { data: animals, error } = await supabase
    .from("animals")
    .select("id, name, tank_id")
    .eq("status", "active")
    .order("name");

  if (error) {
    redirect("/protected/today");
  }

  const animalOptions = (animals ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    tankId: a.tank_id,
  }));

  return <FeedingLogForm animals={animalOptions} />;
}
