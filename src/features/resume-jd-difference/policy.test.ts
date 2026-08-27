import { describe, expect, it } from "vitest";

import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import {
  STRICT_EVIDENCE_KINDS,
  classifySemanticAlignment,
  findExactExcerpt,
  isPasteReadyRewrite,
  isStrictlyEquivalent,
  sortDifferenceIssues,
  verifyConfirmedFactIds,
} from "./policy";
import type { DifferenceIssue } from "./schemas";

describe("resume JD difference evidence policy", () => {
  it.each([
    ["AWS", "Azure"],
    ["German C1", "German B2"],
    ["five years", "three years"],
    ["work authorization", "visa interest"],
  ])("does not treat strict values as synonyms", (jd, resume) => {
    expect(isStrictlyEquivalent(jd, resume)).toBe(false);
  });

  it("accepts an exact strict value after harmless normalization", () => {
    expect(isStrictlyEquivalent(" German   C1 ", "german c1")).toBe(true);
  });

  it("lists every strict evidence kind required by the design", () => {
    expect(STRICT_EVIDENCE_KINDS).toEqual(
      expect.arrayContaining([
        "tool",
        "framework",
        "cloud",
        "method",
        "years",
        "number",
        "language_level",
        "degree_level",
        "certificate",
        "license",
        "work_authorization",
        "management_scope",
        "result",
      ]),
    );
  });

  it("allows a supported responsibility-language candidate alignment", () => {
    expect(
      classifySemanticAlignment({
        jdTerm: "stakeholder management",
        resumeExcerpt:
          "Gathered reporting needs from business teams and presented findings.",
        strictKind: null,
      }),
    ).toBe("candidate-semantic-alignment");
  });

  it("does not semantically align strict kinds", () => {
    expect(
      classifySemanticAlignment({
        jdTerm: "AWS",
        resumeExcerpt: "Deployed workloads on Azure.",
        strictKind: "cloud",
      }),
    ).toBe("no-evidence");
  });

  it("returns an exact source excerpt across harmless whitespace", () => {
    expect(
      findExactExcerpt(
        "Built dashboards for\n business stakeholders and weekly reporting.",
        "dashboards for business stakeholders",
      ),
    ).toBe("dashboards for\n business stakeholders");
  });

  it("keeps only owned confirmed fact ids", () => {
    const confirmedFacts = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        factType: "skill",
        title: "SQL",
        organization: null,
        description: "Used SQL for weekly reporting.",
        skills: ["SQL"],
        sourceExcerpt: "Used SQL for weekly reporting.",
      },
    ] satisfies ConfirmedFactForAnalysis[];

    expect(
      verifyConfirmedFactIds(
        [
          confirmedFacts[0].id,
          "22222222-2222-4222-8222-222222222222",
          confirmedFacts[0].id,
        ],
        confirmedFacts,
      ),
    ).toEqual([confirmedFacts[0].id]);
  });

  it("detects paste-ready resume bullets but not Chinese directions", () => {
    expect(
      isPasteReadyRewrite(
        "Collaborated with business stakeholders to align reporting needs and delivered weekly dashboards.",
      ),
    ).toBe(true);
    expect(
      isPasteReadyRewrite("补充真实的协作对象、需求确认过程和报告用途。"),
    ).toBe(false);
  });

  it("sorts non-gate issues critical, important, then minor", () => {
    const issues = [
      issue("issue-1", "minor"),
      issue("issue-2", "critical"),
      issue("issue-3", "important"),
      issue("issue-4", "critical", true),
    ];

    expect(sortDifferenceIssues(issues).map(({ id }) => id)).toEqual([
      "issue-2",
      "issue-3",
      "issue-1",
    ]);
  });
});

function issue(
  id: string,
  priority: DifferenceIssue["priority"],
  isGate = false,
): DifferenceIssue {
  return {
    id,
    conceptId: isGate ? null : "concept-1",
    jdOriginal: "JD text",
    jdTranslationZh: "岗位要求",
    resumeExcerpt: null,
    resumeStatusZh: "当前材料未找到相关证据",
    profileFactIds: [],
    type: isGate ? "gate" : "missing",
    problemZh: "问题",
    reasonZh: "原因",
    priority,
    isGate,
    authenticity: "unsupported",
  };
}
