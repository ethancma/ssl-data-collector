"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

const PASSWORD_ERROR = "Use 12-128 characters with uppercase, lowercase, a number, and a symbol.";

export function InvitationAcceptanceForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 12 || password.length > 128
      || !/[A-Z]/.test(password) || !/[a-z]/.test(password)
      || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError(PASSWORD_ERROR);
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/invite/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not accept invitation.");
      window.location.replace("/protected/home");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not accept invitation.");
      setIsSubmitting(false);
    }
  }

  async function continueWithGoogle() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/invite/${encodeURIComponent(token)}/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Could not start Google sign-in.");
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start Google sign-in.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="invite-password">Password</Label>
          <Input id="invite-password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          <p className="text-xs text-muted-foreground">{PASSWORD_ERROR}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-password-confirmation">Confirm password</Label>
          <Input id="invite-password-confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Creating account..." : "Create account"}</Button>
      </form>
      <div className="relative text-center text-xs text-muted-foreground before:absolute before:inset-x-0 before:top-1/2 before:border-t"><span className="relative bg-card px-2">or</span></div>
      <Button type="button" variant="outline" className="w-full" disabled={isSubmitting} onClick={continueWithGoogle}>Continue with Google</Button>
    </div>
  );
}
