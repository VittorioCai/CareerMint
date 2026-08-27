// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import {
  buildDifferenceFingerprints,
  normalizeDocumentText,
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

const base = {
  jdText: "Analyze customer funnels with SQL.",
  sourceSha256: "a".repeat(64),
  confirmedFacts: [factA, factB],
  provider: "deepseek",
  model: "deepseek-chat",
  promptVersion: "resume-jd-difference-p1-v4.0",
  schemaVersion: "resume-jd-difference-v4",
  policyVersion: "resume-jd-difference-policy-v4.0",
};

describe("resume JD difference fingerprints", () => {
  it("normalizes document whitespace without changing words", () => {
    expect(normalizeDocumentText("  Analyze\r\n\r\ncustomer\t funnels.  ")).toBe(
      "Analyze\ncustomer funnels.",
    );
  });

  it("emits three lowercase SHA-256 values", () => {
    const output = buildDifferenceFingerprints(base);

    expect(output.jdSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(output.factFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(output.inputHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(output)).not.toContain(base.jdText);
  });

  it("is stable across fact and skill order", () => {
    expect(buildDifferenceFingerprints(base)).toEqual(
      buildDifferenceFingerprints({
        ...base,
        confirmedFacts: [
          factB,
          { ...factA, skills: [...factA.skills].reverse() },
        ],
      }),
    );
  });

  it("ignores facts that are not confirmed", () => {
    const pending = {
      ...factA,
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      confirmationStatus: "pending",
    };
    const rejected = {
      ...factB,
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      confirmationStatus: "rejected",
    };

    expect(
      buildDifferenceFingerprints({
        ...base,
        confirmedFacts: [...base.confirmedFacts, pending, rejected],
      }),
    ).toEqual(buildDifferenceFingerprints(base));
  });

  it.each([
    ["JD", { jdText: "Analyze product retention with SQL." }],
    ["resume file", { sourceSha256: "b".repeat(64) }],
    ["provider", { provider: "other" }],
    ["model", { model: "other-model" }],
    ["prompt", { promptVersion: "resume-jd-difference-p2-v4.0" }],
    ["schema", { schemaVersion: "resume-jd-difference-v5" }],
    ["policy", { policyVersion: "resume-jd-difference-policy-v4.1" }],
  ] as const)("changes the input hash when %s changes", (_label, change) => {
    expect(buildDifferenceFingerprints({ ...base, ...change }).inputHash).not.toBe(
      buildDifferenceFingerprints(base).inputHash,
    );
  });

  it("changes the input hash when a confirmed fact changes", () => {
    expect(
      buildDifferenceFingerprints({
        ...base,
        confirmedFacts: [{ ...factA, description: "Changed evidence." }, factB],
      }).inputHash,
    ).not.toBe(buildDifferenceFingerprints(base).inputHash);
  });

  it("rejects an invalid source hash instead of using a filename fallback", () => {
    expect(() =>
      buildDifferenceFingerprints({
        ...base,
        sourceSha256: "resume.pdf",
      }),
    ).toThrow("invalid-resume-sha256");
  });
});
