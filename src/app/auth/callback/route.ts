import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const allowedNextPaths = new Set(["/app", "/onboarding", "/reset-password"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") ?? "/app";
  const next = allowedNextPaths.has(requestedNext) ? requestedNext : "/app";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, siteUrl));
    }
  }

  return NextResponse.redirect(new URL("/login?error=callback", siteUrl));
}
