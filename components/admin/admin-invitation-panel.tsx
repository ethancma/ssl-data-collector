"use client";

import { Copy, RefreshCw, ShieldX } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROFILE_ROLES, type ProfileRole } from "@/lib/config/reference-data";

type OpenInvitation = {
  id: number;
  email: string;
  role: ProfileRole;
  expires_at: string;
  created_at: string;
};

type ApiResult = { error?: string; link?: string; invitations?: OpenInvitation[] };

async function readResult(response: Response): Promise<ApiResult> {
  const result = await response.json() as ApiResult;
  if (!response.ok) throw new Error(result.error || "Request failed. Refresh and retry.");
  return result;
}

export function AdminInvitationPanel() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProfileRole>("volunteer");
  const [invitations, setInvitations] = useState<OpenInvitation[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadInvitations() {
    try {
      const result = await readResult(await fetch("/api/admin/invitations", { cache: "no-store" }));
      setInvitations(result.invitations ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Open invitations could not be loaded.");
    }
  }

  useEffect(() => {
    let mounted = true;
    void fetch("/api/admin/invitations", { cache: "no-store" })
      .then(readResult)
      .then((result) => {
        if (mounted) setInvitations(result.invitations ?? []);
      })
      .catch((cause: unknown) => {
        if (mounted) setError(cause instanceof Error ? cause.message : "Open invitations could not be loaded.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (role === "admin" && !window.confirm(`Grant Admin access to ${email}? Admins can invite other Admins and manage users.`)) return;
    setError(null);
    setNotice(null);
    setLink(null);
    setIsSubmitting(true);
    try {
      const result = await readResult(await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", email, role, confirmAdmin: role === "admin" }),
      }));
      setEmail("");
      setLink(result.link ?? null);
      setNotice("Invite created. This link is shown only once.");
      await loadInvitations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create invitation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function revoke(id: number) {
    if (!window.confirm("Revoke this invitation? The link will stop working.")) return;
    setError(null);
    setBusyId(id);
    try {
      await readResult(await fetch(`/api/admin/invitations?id=${id}`, { method: "DELETE" }));
      setInvitations((current) => current.filter((invitation) => invitation.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke invitation.");
    } finally {
      setBusyId(null);
    }
  }

  async function regenerate(invitation: OpenInvitation) {
    if (!window.confirm("Revoke this link and create a new one?")) return;
    setError(null);
    setLink(null);
    setNotice(null);
    setBusyId(invitation.id);
    try {
      const result = await readResult(await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate", id: invitation.id }),
      }));
      setLink(result.link ?? null);
      setNotice("Invitation regenerated. This link is shown only once.");
      await loadInvitations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not regenerate invitation.");
    } finally {
      setBusyId(null);
    }
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setNotice("Invite link copied.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Invite a person</CardTitle>
        <CardDescription>Create a link to share directly with the invited person.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void createInvite(event)}>
          <div className="grid min-w-56 flex-1 gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <select id="invite-role" className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value as ProfileRole)}>
              {PROFILE_ROLES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create invite"}</Button>
        </form>
        {link && (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
            <Label htmlFor="invite-link">Invite link</Label>
            <div className="flex flex-wrap gap-2">
              <Input id="invite-link" readOnly value={link} className="min-w-0 flex-1" />
              <Button type="button" variant="outline" onClick={() => void copyLink()}><Copy />Copy link</Button>
            </div>
          </div>
        )}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Open invites</h2>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open invitations.</p>
          ) : (
            <div className="flex flex-col divide-y rounded-md border">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 p-3 px-4">
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium">{invitation.email}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{invitation.role}</Badge>
                      <span>Expires {new Date(invitation.expires_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={busyId !== null} onClick={() => void regenerate(invitation)}><RefreshCw />Regenerate</Button>
                    <Button type="button" size="sm" variant="destructive" disabled={busyId !== null} onClick={() => void revoke(invitation.id)}><ShieldX />Revoke</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}