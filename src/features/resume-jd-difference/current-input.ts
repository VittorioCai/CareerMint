import "server-only";

import type { ConfirmedFactForAnalysis } from "@/features/career-profile/confirmed-facts";
import type { AppLocale } from "@/i18n/locale";
import { getServerEnv } from "@/lib/env/server";

import { buildDifferenceFingerprints } from "./hashes";
import {
  differencePrompt,
  RESUME_JD_DIFFERENCE_POLICY_VERSION,
  RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
} from "./prompts";
import type { ResumeJDDifferenceRun } from "./repository";

export const FAKE_DIFFERENCE_PROVIDER = "fake";
export const FAKE_DIFFERENCE_MODEL = "fake-resume-jd-difference-v4";

/**
 * Which provider and model an analysis runs under right now.
 *
 * Both are part of `input_hash`. The route that starts an analysis and the
 * page that decides whether a stored one is still current each used to work
 * this out for themselves, down to their own copy of the fake model's name,
 * and nothing checked that the two agreed. Had they drifted, the page would
 * have marked every run stale while the route went on reusing them.
 */
export function differenceProviderConfiguration() {
  const env = getServerEnv();
  return env.E2E_FAKE_EXTRACTOR === "1" &&
    process.env.NODE_ENV !== "production"
    ? { provider: FAKE_DIFFERENCE_PROVIDER, model: FAKE_DIFFERENCE_MODEL }
    : { provider: env.AI_TEXT_PROVIDER, model: env.AI_TEXT_MODEL };
}

/**
 * Whether a stored run is the one these inputs would produce today.
 *
 * Asked of a run rather than answered with a single hash, because the text a
 * run was made from is not always a function of the file: a scanned resume is
 * analysed from what the browser recognised or the user pasted, and only the
 * run knows which text that was. The question for such a run is whether the
 * same text would be analysed the same way now — the same JD, facts, model,
 * prompt and language.
 */
export function currentDifferenceInputs(input: {
  applicationId: string;
  jdText: string;
  sourceSha256: string;
  confirmedFacts: readonly ConfirmedFactForAnalysis[];
  locale: AppLocale;
}) {
  const env = getServerEnv();
  const prompt = differencePrompt(
    env.RESUME_JD_DIFFERENCE_PROMPT_VARIANT,
    input.locale,
  );
  const shared = {
    applicationId: input.applicationId,
    jdText: input.jdText,
    sourceSha256: input.sourceSha256,
    confirmedFacts: input.confirmedFacts,
    ...differenceProviderConfiguration(),
    promptVersion: prompt.version,
    schemaVersion: RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
    policyVersion: RESUME_JD_DIFFERENCE_POLICY_VERSION,
  };

  return function matches(run: ResumeJDDifferenceRun) {
    const { inputHash, legacyInputHash } = buildDifferenceFingerprints({
      ...shared,
      resumeTextSha256: run.resumeTextSha256,
    });
    return run.inputHash === inputHash || run.inputHash === legacyInputHash;
  };
}
