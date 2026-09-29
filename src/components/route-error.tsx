"use client";

import Link from "next/link";
import { useEffect } from "react";

import { useErrorCopy } from "@/i18n/error-copy";

/**
 * What a route shows when rendering it threw.
 *
 * Shared by the root boundary and the one inside the signed-in shell. They
 * differ in what is still standing around them — the shell keeps its sidebar
 * and language switch — and in where "back" leads.
 */
export function RouteError({
  error,
  retry,
  home,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  home: "site" | "desk";
}) {
  const copy = useErrorCopy();

  useEffect(() => {
    console.error(error);
  }, [error]);

  // The provider sits in the root layout, which is above every boundary that
  // renders this. Without it there is no language to speak in, so let the
  // error travel up to global-error, which carries its own.
  if (!copy) throw error;

  return (
    <div className="mx-auto w-full max-w-[560px] px-5 py-16" role="alert">
      <p className="type-eyebrow text-[var(--ink-muted)]">{copy.errorEyebrow}</p>
      <h1 className="type-title heading-font mt-3">{copy.errorTitle}</h1>
      <p className="mt-4 text-base font-medium leading-7 text-[var(--ink-muted)]">
        {copy.errorBody}
      </p>
      {error.digest ? (
        <p className="mt-3 break-all text-xs font-medium text-[var(--ink-muted)]">
          {copy.reference.replace("{digest}", error.digest)}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          className="button-primary min-h-11 px-5 text-sm font-semibold"
          onClick={() => retry()}
        >
          {copy.retry}
        </button>
        <Link
          href={home === "desk" ? "/app" : "/"}
          className="button-secondary inline-flex min-h-11 items-center px-5 text-sm font-semibold"
        >
          {home === "desk" ? copy.backToDesk : copy.backHome}
        </Link>
      </div>
    </div>
  );
}
