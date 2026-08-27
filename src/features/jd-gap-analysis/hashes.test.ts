// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import {
  JD_GAP_SCHEMA_VERSION,
  JD_STRUCTURE_SCHEMA_VERSION,
  buildConfirmedFactFingerprint,
  buildJDGapInputHash,
  buildJDStructureInputHash,
} from "./hashes";

const factA: ConfirmedFactForAnalysis = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  factType: "education",
  title: "M.Sc. Management and Digital Technology",
  organization: "TUM",
  description: "Combined business, information systems, and data analytics.",
  skills: ["Data Analytics", "Business Informatics"],
  sourceExcerpt: "M.Sc. Management and Digital Technology",
};

const factB: ConfirmedFactForAnalysis = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  factType: "work_experience",
  title: "Data Analyst Intern",
  organization: "Example",
  description: "Built recurring reports with SQL.",
  skills: ["SQL"],
  sourceExcerpt: "Built recurring reports with SQL",
};

describe("JD gap input hashes", () => {
  it("uses explicit schema versions and emits lowercase SHA-256 values only", () => {
    expect(JD_STRUCTURE_SCHEMA_VERSION).toBe("jd-analysis-v3");
    expect(JD_GAP_SCHEMA_VERSION).toBe("resume-gap-v3");

    const structure = buildJDStructureInputHash({
      jdText: "Advanced SQL required",
      provider: "deepseek",
      model: "deepseek-chat",
      schemaVersion: JD_STRUCTURE_SCHEMA_VERSION,
      promptVersion: "jd-structure-v3",
    });
    const gap = buildJDGapInputHash({
      structureRunId: "11111111-1111-4111-8111-111111111111",
      resumeSha256: "a".repeat(64),
      factFingerprint: "b".repeat(64),
      provider: "deepseek",
      model: "deepseek-chat",
      schemaVersion: JD_GAP_SCHEMA_VERSION,
      promptVersion: "jd-gap-v3",
      policyVersion: "jd-gap-policy-v3",
    });

    expect(structure).toMatch(/^[0-9a-f]{64}$/u);
    expect(gap).toMatch(/^[0-9a-f]{64}$/u);
    expect(structure).not.toContain("Advanced SQL required");
  });

  it.each([
    ["jdText", { jdText: "Advanced Python required" }],
    ["provider", { provider: "other" }],
    ["model", { model: "other-model" }],
    ["schema", { schemaVersion: "jd-analysis-v4" }],
    ["prompt", { promptVersion: "jd-structure-v4" }],
  ] as const)("changes the structure hash when %s changes", (_label, change) => {
    const input = {
      jdText: "Advanced SQL required",
      provider: "deepseek",
      model: "deepseek-chat",
      schemaVersion: JD_STRUCTURE_SCHEMA_VERSION,
      promptVersion: "jd-structure-v3",
    };
    expect(buildJDStructureInputHash({ ...input, ...change })).not.toBe(
      buildJDStructureInputHash(input),
    );
  });

  it("keeps the fact fingerprint stable across fact and skill order", () => {
    expect(buildConfirmedFactFingerprint([factA, factB])).toBe(
      buildConfirmedFactFingerprint([
        factB,
        { ...factA, skills: [...factA.skills].reverse() },
      ]),
    );
  });

  it.each([
    ["field", { ...factA, title: `${factA.title} changed` }],
    ["source", { ...factA, sourceExcerpt: "different verified source" }],
    ["status", { ...factA, confirmationStatus: "pending" }],
    ["source asset", { ...factA, sourceAssetId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }],
  ] as const)("changes the fact fingerprint when a %s changes", (_label, changed) => {
    expect(buildConfirmedFactFingerprint([changed])).not.toBe(
      buildConfirmedFactFingerprint([factA]),
    );
  });

  it.each([
    ["structure", { structureRunId: "22222222-2222-4222-8222-222222222222" }],
    ["resume", { resumeSha256: "c".repeat(64) }],
    ["facts", { factFingerprint: "d".repeat(64) }],
    ["provider", { provider: "other" }],
    ["model", { model: "other-model" }],
    ["schema", { schemaVersion: "resume-gap-v4" }],
    ["prompt", { promptVersion: "jd-gap-v4" }],
    ["policy", { policyVersion: "jd-gap-policy-v4" }],
  ] as const)("changes the gap hash when %s changes", (_label, change) => {
    const input = {
      structureRunId: "11111111-1111-4111-8111-111111111111",
      resumeSha256: "a".repeat(64),
      factFingerprint: "b".repeat(64),
      provider: "deepseek",
      model: "deepseek-chat",
      schemaVersion: JD_GAP_SCHEMA_VERSION,
      promptVersion: "jd-gap-v3",
      policyVersion: "jd-gap-policy-v3",
    };
    expect(buildJDGapInputHash({ ...input, ...change })).not.toBe(
      buildJDGapInputHash(input),
    );
  });
});
