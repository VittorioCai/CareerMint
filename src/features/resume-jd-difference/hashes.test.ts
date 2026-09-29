// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { ConfirmedFactForAnalysis } from "@/features/career-profile/confirmed-facts";

import {
  buildDifferenceFingerprints,
  hashResumeText,
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
  applicationId: "11111111-1111-4111-8111-111111111111",
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
    // Two applications with one JD, one resume and one set of facts. They
    // used to hash alike, and the second could never be analysed.
    ["application", { applicationId: "22222222-2222-4222-8222-222222222222" }],
    // Text the browser supplied is not a function of the file it came with.
    ["supplied resume text", { resumeTextSha256: "c".repeat(64) }],
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

  it("tells one supplied text from another for the same file", () => {
    const recognised = buildDifferenceFingerprints({
      ...base,
      resumeTextSha256: hashResumeText("Data analyst. SQL dashboards."),
    });
    const pasted = buildDifferenceFingerprints({
      ...base,
      resumeTextSha256: hashResumeText("Product manager. Roadmaps."),
    });

    expect(recognised.inputHash).not.toBe(pasted.inputHash);
    // Same file, same JD, same facts: everything that is not the text agrees.
    expect(recognised.jdSha256).toBe(pasted.jdSha256);
    expect(recognised.factFingerprint).toBe(pasted.factFingerprint);
  });

  it("still recognises what these inputs hashed to before", () => {
    // Pinned, not recomputed: this is a value that is already stored in
    // production rows, and the point is that it never moves.
    expect(buildDifferenceFingerprints(base).legacyInputHash).toBe(
      "200fdfa363e18776c17b2acfa7929d53fd7a1d8807ad7f1190c50bd001237b6a",
    );
    // The old key had no application in it.
    expect(
      buildDifferenceFingerprints({
        ...base,
        applicationId: "22222222-2222-4222-8222-222222222222",
      }).legacyInputHash,
    ).toBe(buildDifferenceFingerprints(base).legacyInputHash);
    expect(buildDifferenceFingerprints(base).legacyInputHash).not.toBe(
      buildDifferenceFingerprints(base).inputHash,
    );
  });

  it("has no old hash for supplied text, which the old key left out", () => {
    expect(
      buildDifferenceFingerprints({
        ...base,
        resumeTextSha256: "c".repeat(64),
      }).legacyInputHash,
    ).toBeNull();
  });

  it("rejects a text hash that is not one", () => {
    expect(() =>
      buildDifferenceFingerprints({ ...base, resumeTextSha256: "scan.pdf" }),
    ).toThrow("invalid-resume-text-sha256");
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
