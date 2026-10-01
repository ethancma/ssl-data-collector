import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InvitationAcceptanceForm } from "@/components/invitation-acceptance-form";
import { getInvitationByToken, isOpenInvitation, isValidInvitationToken, publicInvitationError } from "@/app/invite/invitation-server";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let invitation = null;
  if (isValidInvitationToken(token)) {
    try {
      invitation = (await getInvitationByToken(token)).data;
    } catch {
      invitation = null;
    }
  }
  const open = isOpenInvitation(invitation);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <meta name="referrer" content="no-referrer" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Accept invitation</CardTitle>
          <CardDescription>{open ? "Create your account for Sunflower Star Laboratory." : publicInvitationError()}</CardDescription>
        </CardHeader>
        {open && invitation ? (
          <CardContent className="space-y-5">
            <dl className="grid gap-3 text-sm">
              <div><dt className="text-muted-foreground">Invited email</dt><dd className="font-medium">{invitation.email}</dd></div>
              <div><dt className="text-muted-foreground">Role</dt><dd className="font-medium capitalize">{invitation.role}</dd></div>
              <div><dt className="text-muted-foreground">Expires</dt><dd className="font-medium">{formatDate(invitation.expires_at)}</dd></div>
            </dl>
            <InvitationAcceptanceForm token={token} />
          </CardContent>
        ) : null}
      </Card>
    </main>
  );
}
