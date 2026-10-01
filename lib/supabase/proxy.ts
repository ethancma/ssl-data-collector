import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  PROFILE_ROLES,
  type ProfileRole,
} from "@/lib/config/reference-data";
import { hasEnvVars } from "../utils";

type AuthoritativeProfile = {
  role: string | null;
  status: string | null;
};

export function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname === "/invite" ||
    pathname.startsWith("/invite/")
  );
}

export function getExpectedAuthRole(
  profile: AuthoritativeProfile | null,
): ProfileRole | "authenticated" {
  const validRole = PROFILE_ROLES.find((role) => role === profile?.role);

  return profile?.status === "active" && validRole
    ? validRole
    : "authenticated";
}

export function getRoleClaimAction(
  currentRole: unknown,
  expectedRole: ProfileRole | "authenticated",
  hasRefreshed = false,
) {
  if (currentRole === expectedRole) {
    return "continue" as const;
  }

  return hasRefreshed ? ("sign-out" as const) : ("refresh" as const);
}

function redirectWithCookies(url: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) =>
    redirectResponse.cookies.set(cookie),
  );
  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip proxy check. You can remove this
  // once you setup the project.
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "core" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    if (isPublicPath(request.nextUrl.pathname)) {
      return supabaseResponse;
    }

    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return redirectWithCookies(url, supabaseResponse);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("auth_user_id", claims.sub)
    .maybeSingle();
  const expectedRole = getExpectedAuthRole(profile);

  if (getRoleClaimAction(claims.role, expectedRole) === "refresh") {
    const { data: refreshData, error: refreshError } =
      await supabase.auth.refreshSession();
    const accessToken = refreshData.session?.access_token;

    if (!refreshError && accessToken) {
      const { data: refreshedClaimsData } =
        await supabase.auth.getClaims(accessToken);

      if (
        getRoleClaimAction(
          refreshedClaimsData?.claims.role,
          expectedRole,
          true,
        ) === "continue"
      ) {
        return redirectWithCookies(request.nextUrl.clone(), supabaseResponse);
      }
    }

    await supabase.auth.signOut({ scope: "local" });

    if (isPublicPath(request.nextUrl.pathname)) {
      return supabaseResponse;
    }

    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return redirectWithCookies(url, supabaseResponse);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
