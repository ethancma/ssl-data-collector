import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/",
    "/auth/:path*",
    "/invite/:path*",
    "/protected/:path*",
    "/api/admin/:path*",
  ],
};
