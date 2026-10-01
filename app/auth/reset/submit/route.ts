import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function failure(message: string, status = 400) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return failure("Invalid request origin.", 403);
  }

  let body: { token_hash?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return failure("Invalid reset request.");
  }
  const tokenHash = body.token_hash;
  const password = body.password;
  if (typeof tokenHash !== "string" || !tokenHash || typeof password !== "string") {
    return failure("This reset link is invalid or incomplete.", 410);
  }
  if (password.length < 12 || password.length > 128 || !/[A-Z]/.test(password)
    || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return failure("Choose a password of 12-128 characters with uppercase, lowercase, number, and symbol.");
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });
  if (verifyError) return failure("This reset link is invalid, expired, or already used.", 410);

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) return failure("Password could not be updated. Check the requirements and retry.");

  return NextResponse.redirect(new URL("/protected/home", request.nextUrl.origin), {
    status: 303,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}