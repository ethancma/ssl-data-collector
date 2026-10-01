"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PROFILE_ROLES, type ProfileRole, type ProfileStatus } from "@/lib/config/reference-data";

type ProfileRow = {
  id: number;
  email: string;
  display_name: string | null;
  role: ProfileRole | null;
  status: ProfileStatus;
  created_at: string;
};

const STATUS_BADGE_VARIANT: Record<ProfileStatus, "secondary" | "default" | "destructive"> = {
  pending: "secondary", active: "default", denied: "destructive",
};

async function postAction(body: object): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch("/api/admin/invitations", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed. Refresh and retry.");
  return result;
}

export function AdminUsersTable({ profiles, currentProfileId }: { profiles: ProfileRow[]; currentProfileId: number | null }) {
  return (
    <div className="flex w-full flex-col gap-6">
      <Card>
        <CardHeader><CardTitle className="text-xl">Users</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col divide-y rounded-md border">
            {profiles.map((profile) => <UserRow key={profile.id} profile={profile} currentProfileId={currentProfileId} />)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UserRow({ profile, currentProfileId }: {
  profile: ProfileRow;
  currentProfileId: number | null;
}) {
  const router = useRouter();
  const [role, setRole] = useState<ProfileRole>(profile.role ?? "volunteer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(action: "deny" | "role" | "remove") {
    if (action === "role" && role === "admin" && !window.confirm(`Grant Admin access to ${profile.email}?`)) return;
    if (action === "remove" && !window.confirm(`Remove access for ${profile.email}? Their historical entries will remain, but future login will be blocked.`)) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await postAction(action === "remove"
        ? { action, id: profile.id }
        : { action, id: profile.id, role, confirmAdmin: action === "role" && role === "admin" });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change access.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyResetLink() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/users/${profile.id}/reset-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not generate a reset link.");
      await navigator.clipboard.writeText(result.link);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not copy the reset link.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 px-4">
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">{profile.display_name || profile.email}</span>
        <span className="break-all text-xs text-muted-foreground">{profile.email}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(profile.status === "active" || profile.status === "denied") && (
          <select aria-label={`Role for ${profile.email}`} className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={role} disabled={isSubmitting} onChange={(event) => setRole(event.target.value as ProfileRole)}>
            {PROFILE_ROLES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        )}
        <Badge variant={STATUS_BADGE_VARIANT[profile.status]}>{profile.status}</Badge>
        <span className="text-xs text-muted-foreground">{new Date(profile.created_at).toLocaleDateString()}</span>
        {profile.status === "active" && role !== profile.role && (
          <Button type="button" size="sm" variant="outline" disabled={isSubmitting} onClick={() => void update("role")}>Save role</Button>
        )}
        {profile.status === "active" && profile.id !== currentProfileId && (
          <Button type="button" size="sm" variant="destructive" disabled={isSubmitting} onClick={() => void update("remove")}>Remove access</Button>
        )}
        {profile.status === "active" && (
          <Button type="button" size="sm" variant="outline" disabled={isSubmitting} onClick={() => void copyResetLink()}>Copy reset link</Button>
        )}
        {profile.status !== "active" && profile.status !== "denied" && (
          <Button type="button" size="sm" variant="outline" disabled={isSubmitting} onClick={() => void update("deny")}>Deny</Button>
        )}
      </div>
      {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    </div>
  );
}
