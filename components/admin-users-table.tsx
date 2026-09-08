"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PROFILE_ROLES,
  PROFILE_STATUSES,
  type ProfileRole,
  type ProfileStatus,
} from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";

type ProfileRow = {
  id: number;
  email: string;
  display_name: string | null;
  role: ProfileRole | null;
  status: ProfileStatus;
  created_at: string;
};

const STATUS_BADGE_VARIANT: Record<ProfileStatus, "secondary" | "default" | "destructive"> = {
  pending: "secondary",
  active: "default",
  denied: "destructive",
};

export function AdminUsersTable({ profiles }: { profiles: ProfileRow[] }) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl">Users</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y rounded-md border">
          {profiles.map((profile) => (
            <UserRow key={profile.id} profile={profile} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function UserRow({ profile }: { profile: ProfileRow }) {
  const router = useRouter();
  const [role, setRole] = useState<ProfileRole | "">(profile.role ?? "");
  const [status, setStatus] = useState<ProfileStatus>(profile.status);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateProfile = async (nextStatus: ProfileStatus) => {
    setError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ role: role || null, status: nextStatus })
      .eq("id", profile.id);
    setIsSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStatus(nextStatus);
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-4">
      <div className="flex flex-col">
        <span className="font-medium">{profile.display_name || profile.email}</span>
        <span className="text-xs text-muted-foreground">{profile.email}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as ProfileRole | "")}
        >
          <option value="">No role</option>
          {PROFILE_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
          value={status}
          onChange={(e) => updateProfile(e.target.value as ProfileStatus)}
        >
          {PROFILE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <Badge variant={STATUS_BADGE_VARIANT[status]}>{status}</Badge>

        <span className="text-xs text-muted-foreground">
          {new Date(profile.created_at).toLocaleDateString()}
        </span>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!role || isSubmitting}
          onClick={() => updateProfile("active")}
        >
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => updateProfile("denied")}
        >
          Deny
        </Button>
      </div>

      {error && <p className="w-full text-sm text-red-500">{error}</p>}
    </div>
  );
}
