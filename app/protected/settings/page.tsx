import { getCurrentProfile } from "@/lib/supabase/current-profile";

import { SettingsLayout } from "./settings-layout";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-bold text-2xl">User settings</h1>
        <p className="text-sm text-muted-foreground">
          Update your name and password. Email, role, and status are managed
          by an admin.
        </p>
      </div>

      {!profile ? (
        <p className="text-sm text-muted-foreground">
          Unable to load your profile.
        </p>
      ) : (
        <SettingsLayout
          profile={{
            id: profile.id,
            email: profile.email,
            displayName: profile.display_name,
            role: profile.role,
            status: profile.status,
          }}
        />
      )}
    </div>
  );
}
