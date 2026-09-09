import type { ProfileRole, ProfileStatus } from "@/lib/config/reference-data";

export type SettingsProfile = {
  id: number;
  email: string;
  displayName: string | null;
  role: ProfileRole | null;
  status: ProfileStatus;
};

export const STATUS_BADGE_VARIANT: Record<
  ProfileStatus,
  "secondary" | "default" | "destructive"
> = {
  pending: "secondary",
  active: "default",
  denied: "destructive",
};

// display_name has no first/last split in the schema; derive on the first space.
export function splitDisplayName(displayName: string | null) {
  const trimmed = (displayName ?? "").trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const [firstName, ...rest] = trimmed.split(" ");
  return { firstName, lastName: rest.join(" ") };
}
