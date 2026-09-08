import { AuthButton } from "@/components/auth-button";
import { ProtectedShell } from "@/components/protected-shell";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { InfoIcon } from "lucide-react";
import { Suspense } from "react";

const BASE_NAV_LINKS = [
  { label: "User settings", href: "/protected/settings" },
  { label: "Today", href: "/protected/today" },
  { label: "Historic data", href: "/protected/history" },
];

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  const navLinks =
    profile?.role === "admin" && profile?.status === "active"
      ? [{ label: "Admin", href: "/protected/admin" }, ...BASE_NAV_LINKS]
      : BASE_NAV_LINKS;

  return (
    <ProtectedShell
      authSlot={
        <Suspense>
          <AuthButton />
        </Suspense>
      }
      navLinks={navLinks}
    >
      <Suspense
        fallback={
          <div className="w-full flex flex-col rounded-md border p-4 text-sm text-muted-foreground">
            Loading…
          </div>
        }
      >
        <ApprovalGate>{children}</ApprovalGate>
      </Suspense>
    </ProtectedShell>
  );
}

async function ApprovalGate({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile || profile.status === "active") {
    return <>{children}</>;
  }

  if (profile.status === "denied") {
    return (
      <div className="w-full">
        <div className="bg-accent text-sm p-3 px-5 rounded-md text-foreground flex gap-3 items-center">
          <InfoIcon size="16" strokeWidth={2} />
          Your account request was denied. Contact an admin if you believe
          this is a mistake.
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="bg-accent text-sm p-3 px-5 rounded-md text-foreground flex gap-3 items-center">
        <InfoIcon size="16" strokeWidth={2} />
        Your account ({profile.email}) is pending admin approval. Check back
        once an admin has approved your account.
      </div>
    </div>
  );
}
