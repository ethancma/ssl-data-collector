"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

import { splitDisplayName } from "./types";

// Only `display_name` may be written here — profiles_update_self RLS blocks
// any other column, so we join first/last back into that single text field.
export function ProfileForm({
  profileId,
  initialDisplayName,
}: {
  profileId: number;
  initialDisplayName: string | null;
}) {
  const router = useRouter();
  const initial = splitDisplayName(initialDisplayName);
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);

    const displayName = `${firstName} ${lastName}`.trim();
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", profileId);

    setIsSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    router.refresh();
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="first-name">First name</Label>
          <Input
            id="first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="last-name">Last name</Label>
          <Input
            id="last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {success && !error && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        {isSubmitting ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
