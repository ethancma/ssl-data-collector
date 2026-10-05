import { ProtectedShell } from "@/components/layout/protected-shell";
import { LogoutButton } from "@/components/auth/logout-button";
import { getCurrentProfile } from "@/lib/supabase/current-profile";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== "active") {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <p role="status" className="text-sm text-muted-foreground">
          {profile?.status === "denied"
            ? "This account does not have access. Contact an administrator for a new invitation."
            : "This account does not have access to the lab. Ask an Admin for an invitation."}
        </p>
        <LogoutButton />
      </main>
    );
  }
  const showAdmin = profile?.role === "admin" && profile?.status === "active";
  const showDailyOperations =
    profile?.status === "active" &&
    ["admin", "technician", "volunteer"].includes(profile.role);
  const showLabSettings =
    profile?.status === "active" &&
    ["admin", "technician"].includes(profile.role);

  return (
    <ProtectedShell
      showAdmin={showAdmin}
      showDailyOperations={showDailyOperations}
      showLabSettings={showLabSettings}
      userEmail={profile?.email}
      userRole={profile?.role}
    >
      {children}
    </ProtectedShell>
  );
}
