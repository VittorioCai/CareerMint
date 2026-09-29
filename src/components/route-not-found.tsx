import Link from "next/link";

import type { Dictionary } from "@/i18n/dictionaries/en";

export function RouteNotFound({
  copy,
  home,
}: {
  copy: Dictionary["errorPages"];
  home: "site" | "desk";
}) {
  return (
    <div className="mx-auto w-full max-w-[560px] px-5 py-16">
      <p className="type-eyebrow text-[var(--ink-muted)]">{copy.notFoundEyebrow}</p>
      <h1 className="type-title heading-font mt-3">{copy.notFoundTitle}</h1>
      <p className="mt-4 text-base font-medium leading-7 text-[var(--ink-muted)]">
        {copy.notFoundBody}
      </p>
      <Link
        href={home === "desk" ? "/app" : "/"}
        className="button-primary mt-8 inline-flex min-h-11 items-center px-5 text-sm font-semibold"
      >
        {home === "desk" ? copy.backToDesk : copy.backHome}
      </Link>
    </div>
  );
}
