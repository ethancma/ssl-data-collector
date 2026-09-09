"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";
import { STATUS_BADGE_VARIANT, splitDisplayName, type SettingsProfile } from "./types";

// Layout B — narrow read-only summary on the left, editable forms on the right.
export function LayoutB({ profile }: { profile: SettingsProfile }) {
  const { firstName } = splitDisplayName(profile.displayName);
  const initial = (firstName || profile.email).charAt(0).toUpperCase();

  return (
    <div className="grid w-full max-w-4xl gap-6 md:grid-cols-[16rem_1fr]">
      <Card className="h-fit">
        <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground">
            {initial}
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-medium">
              {profile.displayName || profile.email}
            </span>
            <span className="text-xs text-muted-foreground">{profile.email}</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge variant="outline">{profile.role ?? "No role"}</Badge>
            <Badge variant={STATUS_BADGE_VARIANT[profile.status]}>
              {profile.status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm
              profileId={profile.id}
              initialDisplayName={profile.displayName}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Password</CardTitle>
          </CardHeader>
          <CardContent>
            <PasswordForm email={profile.email} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
