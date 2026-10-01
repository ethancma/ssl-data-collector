"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";

export function ResetPasswordForm({ tokenHash }: { tokenHash: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(tokenHash ? null : "This reset link is invalid or incomplete.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("New passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/auth/reset/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, password }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "This reset link is invalid, expired, or already used.");
      }
      router.replace("/protected/home");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The password could not be updated.");
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="new-password">New password</Label>
        <Input id="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} />
        <p className="text-xs text-muted-foreground">12-128 characters, including uppercase, lowercase, a number, and a symbol.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={isSubmitting || !tokenHash}>
        {isSubmitting ? "Updating..." : "Set password and continue"}
      </Button>
    </form>
  );
}