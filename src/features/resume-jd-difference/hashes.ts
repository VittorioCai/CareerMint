import { createHash } from "node:crypto";

import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

const sha256Pattern = /^[0-9a-f]{64}$/u;

export type DifferenceFingerprintFact = ConfirmedFactForAnalysis & {
  confirmationStatus?: string;
  sourceAssetId?: string | null;
};

export type DifferenceFingerprintInput = {
  jdText: string;
  sourceSha256: string;
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

export function buildDifferenceFingerprints(
  input: DifferenceFingerprintInput,
) {
  if (!sha256Pattern.test(input.sourceSha256)) {
    throw new Error("invalid-resume-sha256");
  }

  const jdSha256 = sha256(normalizeDocumentText(input.jdText));
  const factFingerprint = buildFactFingerprint(input.confirmedFacts);
  const inputHash = sha256(
    JSON.stringify({
      domain: "resume-jd-difference-input-v4",
      jdSha256,
      sourceSha256: input.sourceSha256,
      factFingerprint,
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion,
      policyVersion: input.policyVersion,
    }),
  );

  return { jdSha256, factFingerprint, inputHash };
}
