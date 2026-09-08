import { InfoIcon } from "lucide-react";

import { getCurrentProfile } from "@/lib/supabase/current-profile";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  if (profile?.role === "admin" && profile?.status === "active") {
    return <>{children}</>;
  }

  return (
    <div className="w-full">
      <div className="bg-accent text-sm p-3 px-5 rounded-md text-foreground flex gap-3 items-center">
        <InfoIcon size="16" strokeWidth={2} />
        Not authorized. This page is limited to active admins.
      </div>
    </div>
  );
}
