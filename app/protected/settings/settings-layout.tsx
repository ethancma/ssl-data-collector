"use client";

import { useTheme } from "next-themes";

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

// Sidebar summary + editable panel layout.
export function SettingsLayout({ profile }: { profile: SettingsProfile }) {
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

const APPEARANCE_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="text-xl">Appearance</CardTitle>
      </CardHeader>
      <CardContent>
        <fieldset aria-describedby="appearance-help" className="space-y-3">
          <legend className="text-sm font-medium">Color theme</legend>
          <p id="appearance-help" className="text-sm text-muted-foreground">
            System follows your device setting. Your choice is saved on this device.
          </p>
          <div className="inline-flex max-w-full flex-wrap gap-1 rounded-full bg-muted p-1">
            {APPEARANCE_OPTIONS.map((option) => (
              <label key={option.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="color-theme"
                  value={option.value}
                  checked={theme === option.value}
                  onChange={() => setTheme(option.value)}
                  className="peer sr-only"
                />
                <span className="inline-flex min-h-11 min-w-16 items-center justify-center rounded-full border border-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground peer-checked:border-border peer-checked:bg-background peer-checked:text-foreground peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background motion-reduce:transition-none">
                  {option.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
