"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function LogoutButton({
  children = "Logout",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick">) {
  const router = useRouter();

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  return (
    <Button {...props} onClick={logout}>
      {children}
    </Button>
  );
}
