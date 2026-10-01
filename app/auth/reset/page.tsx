import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const params = await searchParams;
  const tokenHash = params.type === "recovery" ? params.token_hash ?? "" : "";

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Set a new password</CardTitle>
          <CardDescription>Choose a new password for your lab account.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetPasswordForm tokenHash={tokenHash} />
        </CardContent>
      </Card>
    </div>
  );
}