import Link from "next/link";

export function ProtectedShell({
  authSlot,
  children,
}: {
  authSlot: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex items-center gap-3 p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/protected"}>SSL Data Collection</Link>
            </div>
            <div className="flex-1" />
            {authSlot}
          </div>
        </nav>
        <main className="w-full max-w-5xl p-5">{children}</main>
      </div>
    </div>
  );
}
