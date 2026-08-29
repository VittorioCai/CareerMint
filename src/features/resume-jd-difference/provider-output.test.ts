import { describe, expect, it } from "vitest";

import {
  buildSourceSegments,
  materializeResumeJDDifferenceOutput,
  repairProviderOutput,
  resumeJDDifferenceProviderOutputSchema,
  type ResumeJDDifferenceProviderOutput,
} from "./provider-output";
import { validateResumeJDDifferenceGraph } from "./schemas";

describe("buildSourceSegments", () => {
  it("numbers each non-empty line and keeps its text verbatim", () => {
    const segments = buildSourceSegments(
      "Tasks\n\nSicherer Umgang mit Microsoft PowerPoint und Excel\nSehr gute Deutschkenntnisse",
      "jd",
    );

    expect(segments).toEqual([
      { id: "jd-1", text: "Tasks" },
      { id: "jd-2", text: "Sicherer Umgang mit Microsoft PowerPoint und Excel" },
      { id: "jd-3", text: "Sehr gute Deutschkenntnisse" },
    ]);
  });

  it("splits a multi-sentence line into one segment per sentence", () => {
    const segments = buildSourceSegments(
      "Wir definieren Standards. Wir messen die CX-Performance.",
      "jd",
    );

    expect(segments).toEqual([
      { id: "jd-1", text: "Wir definieren Standards." },
      { id: "jd-2", text: "Wir messen die CX-Performance." },
    ]);
  });

  it("caps a single overlong sentence so it fits the citation limit", () => {
    const long = Array.from({ length: 400 }, (_, i) => `Wort${i}`).join(" ");

    const segments = buildSourceSegments(long, "jd");

    expect(segments.length).toBeGreaterThan(1);
    for (const segment of segments) {
      expect(segment.text.length).toBeLessThanOrEqual(1_000);
    }
  });
});

const jdSegments = buildSourceSegments(
  "Sicherer Umgang mit Microsoft PowerPoint und Excel\nSehr gute Deutschkenntnisse in Wort und Schrift",
  "jd",
);
const resumeSegments = buildSourceSegments(
  "Erstellte woechentliche Reports in Microsoft PowerPoint und Excel",
  "resume",
);

function compactRequirement(overrides: Record<string, unknown> = {}) {
  return {
    jdSegmentId: "jd-1",
    kind: "core",
    comparisonMode: "semantic",
    conceptLabelZh: "办公软件运用",
    jdTerms: ["Microsoft PowerPoint und Excel"],
    importanceReasonZh: "岗位明确要求熟练使用这两个工具。",
    priority: "critical",
    translationZh: "熟练使用 Microsoft PowerPoint 和 Excel。",
    assessment: "partial",
    resumeSegmentId: "resume-1",
    profileFactIds: [],
    gapType: "missing_context",
    resumeStatusZh: "简历提到使用过这两个工具，但没有说明场景。",
    problemZh: "缺少使用场景和产出说明。",
    reasonZh: "简历有直接证据，但描述过于笼统。",
    improvement: {
      targetSection: "experience",
      targetExperienceZh: "周报制作经历",
      focusAreas: ["context", "result"],
      synonymousJobLanguage: ["Entscheidungsvorlagen"],
      needsConfirmation: false,
      directionZh: "补充这些报告的真实受众、频率和实际用途。",
    },
    ...overrides,
  };
}

function compactOutput(
  requirements: unknown[],
): ResumeJDDifferenceProviderOutput {
  return resumeJDDifferenceProviderOutputSchema.parse({
    missionZh: "支持客户体验团队把客户视角带进决策。",
    coreCapabilities: ["数据分析", "跨部门沟通", "演示materials制作"],
    overallSummaryZh: "简历有相邻证据，但岗位语言和场景说明仍不足。",
    requirements,
  });
}

const materializeContext = {
  jdSegments,
  resumeSegments,
  confirmedFactIds: new Set<string>(),
};

describe("materializeResumeJDDifferenceOutput", () => {
  it("resolves segment ids into verbatim source text and a valid graph", () => {
    const output = materializeResumeJDDifferenceOutput(
      compactOutput([compactRequirement()]),
      materializeContext,
    );

    expect(output.issues).toHaveLength(1);
    expect(output.issues[0]!.jdOriginal).toBe(jdSegments[0]!.text);
    expect(output.issues[0]!.resumeExcerpt).toBe(resumeSegments[0]!.text);
    expect(output.directions).toHaveLength(1);
    expect(output.directions[0]!.issueId).toBe(output.issues[0]!.id);
    expect(validateResumeJDDifferenceGraph(output)).toEqual({ ok: true });
  });

  it("rejects a requirement pointing at a resume segment that does not exist", () => {
    expect(() =>
      materializeResumeJDDifferenceOutput(
        compactOutput([compactRequirement({ resumeSegmentId: "resume-99" })]),
        materializeContext,
      ),
    ).toThrow("resume-jd-difference-reference-invalid");
  });

  it("keeps gates within the published schema limit", () => {
    const requirements = Array.from({ length: 20 }, (_, index) =>
      compactRequirement({
        kind: "gate",
        jdSegmentId: index % 2 === 0 ? "jd-1" : "jd-2",
        improvement: null,
      }),
    );

    const output = materializeResumeJDDifferenceOutput(
      compactOutput(requirements),
      materializeContext,
    );

    expect(output.jobCore.gates).toHaveLength(16);
    expect(validateResumeJDDifferenceGraph(output)).toEqual({ ok: true });
  });
});

describe("repairProviderOutput", () => {
  const raw = () => ({
    missionZh: "把客户视角带进决策。",
    coreCapabilities: ["数据分析", "沟通", "演示"],
    overallSummaryZh: "总体判断。",
    requirements: [
      {
        jdSegmentId: "jd-1",
        kind: "core",
        comparisonMode: "semantic",
        conceptLabelZh: "概念",
        jdTerms: ["term"],
        importanceReasonZh: "理由",
        priority: "critical",
        translationZh: "翻译",
        assessment: "partial",
        resumeSegmentId: null,
        profileFactIds: [],
        gapType: "missing_context",
        resumeStatusZh: "状态",
        problemZh: "问题",
        reasonZh: "依据",
        improvement: null,
      },
    ],
  });

  it("drops a gapType the model invented instead of failing the run", () => {
    const input = raw();
    input.requirements[0]!.gapType = "not_a_real_gap_type";

    const repaired = resumeJDDifferenceProviderOutputSchema.safeParse(
      repairProviderOutput(input),
    );

    expect(repaired.success).toBe(true);
    expect(repaired.data!.requirements[0]!.gapType).toBeNull();
  });

  it("truncates an overlong jdTerm instead of failing the run", () => {
    const input = raw();
    input.requirements[0]!.jdTerms = ["x".repeat(400)];

    const repaired = resumeJDDifferenceProviderOutputSchema.safeParse(
      repairProviderOutput(input),
    );

    expect(repaired.success).toBe(true);
    expect(repaired.data!.requirements[0]!.jdTerms[0]!.length).toBe(160);
  });
});
