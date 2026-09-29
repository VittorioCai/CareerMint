"use client";

import { RouteError } from "@/components/route-error";

/**
 * Inside the signed-in layout, so the shell — navigation, account menu,
 * language switch — is still there around a page that failed.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <RouteError error={error} retry={retry} home="desk" />;
}
