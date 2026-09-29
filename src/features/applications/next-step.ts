import type { Application } from "./schemas";

/**
 * What an application needs from its owner next.
 *
 * The product's own measure of success is that the reader can see their next
 * step quickly. It said what that was during setup and then went quiet: once
 * the profile was checked the home page offered "add a JD" whatever state the
 * existing applications were in, and an application's own overview listed six
 * fields without saying which of them mattered today.
 *
 * Derived from what is stored, so it cannot go stale the way a note can.
 */
export const APPLICATION_NEXT_STEPS = [
  "prepare-interview",
  "choose-resume",
  "analyse",
  "read-guidance",
] as const;

export type ApplicationNextStep = (typeof APPLICATION_NEXT_STEPS)[number];

type NextStepApplication = Pick<
  Application,
  "id" | "stage" | "resumeSourceAssetId"
>;

export function applicationNextStep(
  application: NextStepApplication,
  analysed: boolean,
): ApplicationNextStep | null {
  switch (application.stage) {
    // Decided, one way or the other. Nothing is waiting on the owner.
    case "offer":
    case "rejected":
    case "withdrawn":
      return null;
    // An interview has a date on it. It comes before tidying up the
    // comparison, even for an application that never had one.
    case "interview":
      return "prepare-interview";
    default:
      break;
  }
  if (!application.resumeSourceAssetId) return "choose-resume";
  if (!analysed) return "analyse";
  // Sent already: the guidance was for before sending, and what happens
  // next is the employer's move.
  return application.stage === "preparing" ? "read-guidance" : null;
}

const tabFor: Record<ApplicationNextStep, string> = {
  "prepare-interview": "interview",
  "choose-resume": "resume",
  analyse: "difference",
  "read-guidance": "improvements",
};

export function nextStepHref(applicationId: string, step: ApplicationNextStep) {
  return `/applications/${applicationId}?tab=${tabFor[step]}`;
}

function urgency(step: ApplicationNextStep) {
  return step === "prepare-interview" ? 0 : 1;
}

/**
 * The one application to put in front of the owner, and its step.
 *
 * An interview outranks everything. After that the most recently touched
 * application wins, on the view that it is the one being worked on.
 */
export function mostPressingNextStep<T extends NextStepApplication & Pick<Application, "updatedAt">>(
  applications: readonly T[],
  analysedApplicationIds: ReadonlySet<string>,
): { application: T; step: ApplicationNextStep } | null {
  const candidates = applications
    .map((application) => ({
      application,
      step: applicationNextStep(
        application,
        analysedApplicationIds.has(application.id),
      ),
    }))
    .filter(
      (entry): entry is { application: T; step: ApplicationNextStep } =>
        entry.step !== null,
    )
    .sort(
      (left, right) =>
        urgency(left.step) - urgency(right.step) ||
        right.application.updatedAt.localeCompare(left.application.updatedAt),
    );
  return candidates[0] ?? null;
}
