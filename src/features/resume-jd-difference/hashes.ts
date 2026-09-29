import { createHash } from "node:crypto";

import type { ConfirmedFactForAnalysis } from "@/features/career-profile/confirmed-facts";

const sha256Pattern = /^[0-9a-f]{64}$/u;

export type DifferenceFingerprintFact = ConfirmedFactForAnalysis & {
  confirmationStatus?: string;
  sourceAssetId?: string | null;
};

export type DifferenceFingerprintInput = {
  /**
   * Whose analysis this is. Without it two applications with the same JD, the
   * same resume and the same facts hashed alike, the second could not get a
   * run of its own — `input_hash` is unique per user — and asking for one
   * failed for good, under a message that said to try again later.
   */
  applicationId: string;
  jdText: string;
  sourceSha256: string;
  /**
   * The text the browser sent, when the file's own could not be read: what
   * local OCR recognised, or what the user pasted. It is not a function of
   * the file, so the file's hash does not stand for it. Leaving it out meant
   * a second, different text for the same file came back with the first
   * text's analysis, marked as reused.
   */
  resumeTextSha256?: string | null;
  confirmedFacts: readonly DifferenceFingerprintFact[];
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  policyVersion: string;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeInlineText(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function normalizeDocumentText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function buildFactFingerprint(facts: readonly DifferenceFingerprintFact[]) {
  const canonicalFacts = facts
    .filter(
      ({ confirmationStatus }) =>
        confirmationStatus === undefined || confirmationStatus === "confirmed",
    )
    .map((fact) => ({
      id: fact.id,
      factType: fact.factType,
      title: normalizeInlineText(fact.title),
      organization: fact.organization
        ? normalizeInlineText(fact.organization)
        : null,
      description: normalizeDocumentText(fact.description),
      skills: fact.skills.map(normalizeInlineText).sort(),
      sourceExcerpt: fact.sourceExcerpt
        ? normalizeDocumentText(fact.sourceExcerpt)
        : null,
      sourceAssetId: fact.sourceAssetId ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return sha256(
    JSON.stringify({
      domain: "resume-jd-difference-confirmed-facts-v4",
      facts: canonicalFacts,
    }),
  );
}

/** For text that has already been through `normalizeResumeText`. */
export function hashResumeText(normalizedText: string) {
  return sha256(normalizedText);
}

export function buildDifferenceFingerprints(
  input: DifferenceFingerprintInput,
) {
  if (!sha256Pattern.test(input.sourceSha256)) {
    throw new Error("invalid-resume-sha256");
  }
  const resumeTextSha256 = input.resumeTextSha256 ?? null;
  if (resumeTextSha256 !== null && !sha256Pattern.test(resumeTextSha256)) {
    throw new Error("invalid-resume-text-sha256");
  }

  const jdSha256 = sha256(normalizeDocumentText(input.jdText));
  const factFingerprint = buildFactFingerprint(input.confirmedFacts);
  const shared = {
    jdSha256,
    sourceSha256: input.sourceSha256,
    factFingerprint,
    provider: input.provider,
    model: input.model,
    promptVersion: input.promptVersion,
    schemaVersion: input.schemaVersion,
    policyVersion: input.policyVersion,
  };
  const inputHash = sha256(
    JSON.stringify({
      domain: "resume-jd-difference-input-v5",
      applicationId: input.applicationId,
      resumeTextSha256,
      ...shared,
    }),
  );
  // What the same inputs hashed to before the application and the text
  // joined the key. Nothing new is ever stored under it. It is here so a run
  // made before then is still recognised as current: otherwise every stored
  // analysis would turn stale at once, under a notice saying the material
  // had changed when it had not.
  //
  // A run made from browser-supplied text has no such hash — before, the
  // text was not part of the key, which is the fault being fixed.
  const legacyInputHash =
    resumeTextSha256 === null
      ? sha256(
          JSON.stringify({
            domain: "resume-jd-difference-input-v4",
            ...shared,
          }),
        )
      : null;

  return { jdSha256, factFingerprint, inputHash, legacyInputHash };
}
