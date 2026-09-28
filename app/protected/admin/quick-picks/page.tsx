import { redirect } from "next/navigation";

export default function LegacyQuickPickCatalogsPage() {
  redirect("/protected/settings/quick-picks");
}
