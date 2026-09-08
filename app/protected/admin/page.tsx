import { Suspense } from "react";

import { AdminUsersTable } from "@/components/admin-users-table";
import { createClient } from "@/lib/supabase/server";

export default function AdminPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      <h1 className="font-bold text-2xl">Admin</h1>
      <Suspense
        fallback={
          <div className="flex flex-col rounded-md border p-4 text-sm text-muted-foreground">
            Loading…
          </div>
        }
      >
        <AdminContent />
      </Suspense>
    </div>
  );
}

const STATUS_ORDER: Record<string, number> = { pending: 0, active: 1, denied: 2 };

async function AdminContent() {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, status, created_at")
    .order("created_at");

  const sorted = [...(profiles ?? [])].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  );

  return <AdminUsersTable profiles={sorted} />;
}
