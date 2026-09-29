import Link from "next/link";

import type { Dictionary } from "@/i18n/dictionaries/en";

import { nextStepHref, type ApplicationNextStep } from "./next-step";
import type { Application } from "./schemas";

const copyKey = {
  "prepare-interview": "prepareInterview",
  "choose-resume": "chooseResume",
  analyse: "analyse",
  "read-guidance": "readGuidance",
} as const satisfies Record<
  ApplicationNextStep,
  keyof Dictionary["applications"]["nextStep"]["steps"]
>;

/**
 * The next step, as the one thing on the page that is filled in.
 *
 * `named` is for the home page, where the reader has to be told which
 * application this is about. On the application's own page they know.
 */
export function NextStepCard({
  application,
  step,
  copy,
  named = false,
}: {
  application: Pick<Application, "id" | "companyName" | "roleTitle">;
  step: ApplicationNextStep;
  copy: Dictionary["applications"]["nextStep"];
  named?: boolean;
}) {
  const text = copy.steps[copyKey[step]];

  return (
    <article className="soft-surface p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
      <div className="min-w-0">
        <p className="type-eyebrow text-[var(--ink-muted)]">{copy.eyebrow}</p>
        <h2 className="heading-font mt-2 type-section">{text.title}</h2>
        {named ? (
          <p className="mt-1 break-words text-sm font-semibold">
            {application.companyName} · {application.roleTitle}
          </p>
        ) : null}
        <p className="mt-2 type-caption text-[var(--ink-muted)]">{text.body}</p>
      </div>
      <Link
        href={nextStepHref(application.id, step)}
        className="button-primary press mt-5 inline-flex min-h-11 shrink-0 items-center px-5 text-sm font-semibold sm:mt-0"
      >
        {text.cta}
      </Link>
    </article>
  );
}
