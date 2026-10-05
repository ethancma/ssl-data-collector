import { Suspense } from "react";

import { AdminInvitationPanel } from "@/components/admin/admin-invitation-panel";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { createClient } from "@/lib/supabase/server";

export default function AdminPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
      <AdminInvitationPanel />
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
  const currentProfile = await getCurrentProfile();
  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, status, created_at")
    .order("created_at");
  if (error) return <p role="alert" className="text-sm text-destructive">Users could not be loaded.</p>;

  const sorted = [...(profiles ?? [])].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  );

  return <AdminUsersTable profiles={sorted} currentProfileId={currentProfile?.id ?? null} />;
}
