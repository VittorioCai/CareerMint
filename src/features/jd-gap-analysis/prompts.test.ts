import { describe, expect, it } from "vitest";

import {
  JD_GAP_POLICY_VERSION,
  JD_STRUCTURE_PROMPT_VERSION,
  comparisonPromptVariants,
  jdStructureInstructions,
  selectComparisonPromptVariant,
} from "./prompts";

describe("fixed JD structure prompt", () => {
  it("limits stage one to JD structure, translation, source evidence, and atomic logic", () => {
    expect(JD_STRUCTURE_PROMPT_VERSION).toBe("jd-structure-v3.1");
    expect(jdStructureInstructions).toContain("<job_description>");
    expect(jdStructureInstructions).toContain("untrusted data");
    expect(jdStructureInstructions).toContain("translationZh");
    expect(jdStructureInstructions).toContain("sourceExcerpt");
    expect(jdStructureInstructions).toContain("allowsEquivalent");
    expect(jdStructureInstructions).toContain("explicitGate");
    expect(jdStructureInstructions).toContain("groupRule");
    expect(jdStructureInstructions).toContain("all");
    expect(jdStructureInstructions).toContain("any");
    expect(jdStructureInstructions).toMatch(/or|oder/u);
    expect(jdStructureInstructions).toMatch(/equivalent|comparable|vergleichbar/u);
    expect(jdStructureInstructions).toContain("Do not decide whether any user matches");
    expect(jdStructureInstructions).not.toContain("<resume_document>");
    expect(jdStructureInstructions).not.toContain("<confirmed_career_facts>");
  });
});

describe("comparison prompt candidates", () => {
  it("keeps a shared evidence contract and the full category strictness matrix", () => {
    expect(JD_GAP_POLICY_VERSION).toBe("jd-gap-policy-v3.1");
    expect(Object.keys(comparisonPromptVariants)).toEqual(["p1", "p2", "p3"]);

    for (const candidate of Object.values(comparisonPromptVariants)) {
      const prompt = candidate.instructions;
      expect(prompt).toContain("every supplied criterion ID exactly once");
      expect(prompt).toContain("keyword overlap is never enough");
      expect(prompt).toContain("exact substring from <resume_document>");
      expect(prompt).toContain("profile facts never improve resumeEvidenceStatus");
      expect(prompt).toContain("degree level");
      expect(prompt).toContain("degree field");
      expect(prompt).toContain("years of experience");
      expect(prompt).toContain("language");
      expect(prompt).toContain("work authorization");
      expect(prompt).toContain("certificate or license");
      expect(prompt).toContain("specified tool");
      expect(prompt).toContain("responsibility");
      expect(prompt).toContain("industry");
      expect(prompt).toContain("soft skill");
      expect(prompt).toContain("quantified outcome");
      expect(prompt).toContain("preferred requirement");
      expect(prompt).toContain("partial_direct");
      expect(prompt).toContain("needs_confirmation");
    }
  });

  it("adds contrast examples only to P2/P3 and a JSON-only self-check to P3", () => {
    expect(comparisonPromptVariants.p1.version).toBe("jd-gap-p1-rules-v1");
    expect(comparisonPromptVariants.p2.version).toBe("jd-gap-p2-contrast-v1");
    expect(comparisonPromptVariants.p3.version).toBe("jd-gap-p3-self-check-v1");
    expect(comparisonPromptVariants.p1.instructions).not.toContain("Contrast examples");
    expect(comparisonPromptVariants.p2.instructions).toContain("Contrast examples");
    expect(comparisonPromptVariants.p2.instructions).toContain(
      "Business Informatics",
    );
    expect(comparisonPromptVariants.p2.instructions).toContain(
      "profile-only support",
    );
    expect(comparisonPromptVariants.p3.instructions).toContain("Before returning JSON");
    expect(comparisonPromptVariants.p3.instructions).toContain(
      "Return only the JSON envelope",
    );
  });

  it("selects only an allowlisted candidate", () => {
    expect(selectComparisonPromptVariant("p2")).toEqual(
      comparisonPromptVariants.p2,
    );
    expect(() => selectComparisonPromptVariant("experimental")).toThrow(
      "jd-gap-prompt-variant-invalid",
    );
  });
});
