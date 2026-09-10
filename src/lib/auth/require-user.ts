import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Who is making this request.
 *
 * `supabase.auth.getUser()` is a round trip to the auth server, and one render
 * asks this question several times: the layout resolves the interface
 * language, the page guards itself, and a panel wants an id. Cached per
 * request, so the answer is fetched once and the rest read it.
 */
export const getCurrentUser = cache(
  async (): Promise<{ id: string; email?: string } | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) return null;

    return { id: data.user.id, email: data.user.email };
  },
);

export async function requireUser(): Promise<{ id: string; email?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
