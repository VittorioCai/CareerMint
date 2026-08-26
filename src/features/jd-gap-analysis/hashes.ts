import { createHash } from "node:crypto";

import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

export const JD_STRUCTURE_SCHEMA_VERSION = "jd-analysis-v3";
export const JD_GAP_SCHEMA_VERSION = "resume-gap-v3";

const sha256Pattern = /^[0-9a-f]{64}$/u;

export type ConfirmedFactFingerprintInput = ConfirmedFactForAnalysis & {
  confirmationStatus?: string;
  sourceAssetId?: string | null;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertSha256(value: string, label: string) {
  if (!sha256Pattern.test(value)) throw new Error(`invalid-${label}-sha256`);
}

export function hashTextSha256(value: string) {
  return sha256(value);
}

export function buildJDStructureInputHash(input: {
  jdText: string;
  provider: string;
  model: string;
  schemaVersion: string;
  promptVersion: string;
}) {
  return sha256(
    JSON.stringify({
      domain: "jd-structure-input",
      jdSha256: hashTextSha256(input.jdText),
      provider: input.provider,
      model: input.model,
      schemaVersion: input.schemaVersion,
      promptVersion: input.promptVersion,
    }),
  );
}

export function buildConfirmedFactFingerprint(
  facts: readonly ConfirmedFactFingerprintInput[],
) {
  const canonicalFacts = facts
    .map((fact) => ({
      id: fact.id,
      factType: fact.factType,
      title: fact.title,
      organization: fact.organization,
      description: fact.description,
      skills: [...fact.skills].sort((left, right) => left.localeCompare(right)),
      sourceExcerpt: fact.sourceExcerpt,
      confirmationStatus: fact.confirmationStatus ?? "confirmed",
      sourceAssetId: fact.sourceAssetId ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return sha256(
    JSON.stringify({ domain: "confirmed-career-facts", facts: canonicalFacts }),
  );
}

export function buildJDGapInputHash(input: {
  structureRunId: string;
  resumeSha256: string;
  factFingerprint: string;
  provider: string;
  model: string;
  schemaVersion: string;
  promptVersion: string;
  policyVersion: string;
}) {
  assertSha256(input.resumeSha256, "resume");
  assertSha256(input.factFingerprint, "fact-fingerprint");
  return sha256(
    JSON.stringify({
      domain: "jd-gap-input",
      structureRunId: input.structureRunId,
      resumeSha256: input.resumeSha256,
      factFingerprint: input.factFingerprint,
      provider: input.provider,
      model: input.model,
      schemaVersion: input.schemaVersion,
      promptVersion: input.promptVersion,
      policyVersion: input.policyVersion,
    }),
  );
}
