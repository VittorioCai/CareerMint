import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/require-user";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const user = await requireUser();

  return <AppShell email={user.email}>{children}</AppShell>;
}
