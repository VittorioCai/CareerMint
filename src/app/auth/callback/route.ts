import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const allowedNextPaths = new Set(["/app", "/onboarding", "/reset-password"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/app";
  const next = allowedNextPaths.has(requestedNext) ? requestedNext : "/app";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

  if (url.searchParams.has("token_hash")) {
    if (!tokenHash || type !== "email") {
      return NextResponse.redirect(new URL("/login?error=invalid-link", siteUrl));
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, siteUrl));
    }

    return NextResponse.redirect(new URL("/login?error=invalid-link", siteUrl));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, siteUrl));
    }

    return NextResponse.redirect(
      new URL("/login?error=session-not-created", siteUrl),
    );
  }

  return NextResponse.redirect(new URL("/login?error=invalid-link", siteUrl));
}
