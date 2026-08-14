import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function getCurrentUser(): Promise<{
  id: string;
  email?: string;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email };
}

export async function requireUser(): Promise<{ id: string; email?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
