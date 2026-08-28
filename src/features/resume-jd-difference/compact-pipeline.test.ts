// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { normalizeDocumentText } from "./hashes";
import {
  buildSourceSegments,
  materializeResumeJDDifferenceOutput,
  resumeJDDifferenceProviderOutputSchema,
} from "./provider-output";
import { verifyAndNormalizeDifferenceOutput } from "./service";

const rawJd = `Deine Aufgaben:

Unterstuetzung bei der Analyse von Kundenfeedback und Customer-Experience Kennzahlen
Erstellung von Praesentationen, Berichten und Entscheidungsvorlagen fuer Management und Stakeholder
Sicherer Umgang mit Microsoft PowerPoint und Excel
Sehr gute Deutsch- und Englischkenntnisse in Wort und Schrift`;

const rawResume = `Vittorio Cai
Werkstudent Business Intelligence
Erstellte woechentliche Berichte in Microsoft PowerPoint und Excel fuer das Management.
Analysierte Kundenfeedback aus Umfragen und leitete Handlungsempfehlungen ab.`;

describe("compact protocol end to end", () => {
  it("produces output the service verifier accepts without rewriting evidence", () => {
    const jdText = normalizeDocumentText(rawJd);
    const resumeText = normalizeDocumentText(rawResume);
    const jdSegments = buildSourceSegments(jdText, "jd");
    const resumeSegments = buildSourceSegments(resumeText, "resume");

    const compact = resumeJDDifferenceProviderOutputSchema.parse({
      missionZh: "把客户视角带进管理层决策。",
      coreCapabilities: ["客户数据分析", "管理层沟通", "演示文稿制作"],
      overallSummaryZh: "简历覆盖了工具和报告经历，语言要求仍需本人确认。",
      requirements: [
        {
          jdSegmentId: "jd-4",
          kind: "core",
          comparisonMode: "strict",
          conceptLabelZh: "办公软件运用",
          jdTerms: ["Microsoft PowerPoint und Excel"],
          importanceReasonZh: "岗位明确要求熟练使用这两个工具。",
          priority: "critical",
          translationZh: "熟练使用 Microsoft PowerPoint 和 Excel。",
          assessment: "matched",
          resumeSegmentId: "resume-3",
          profileFactIds: [],
          gapType: null,
          resumeStatusZh: "简历直接写明用这两个工具做过管理层报告。",
          problemZh: null,
          reasonZh: "简历原文包含岗位要求的两个工具名称。",
          improvement: null,
        },
        {
          jdSegmentId: "jd-5",
          kind: "gate",
          comparisonMode: "strict",
          conceptLabelZh: "德语和英语能力",
          jdTerms: ["Deutsch- und Englischkenntnisse"],
          importanceReasonZh: "语言能力是明确的资格门槛。",
          priority: "critical",
          translationZh: "需要很好的德语和英语听说读写能力。",
          assessment: "needs_confirmation",
          resumeSegmentId: null,
          profileFactIds: [],
          gapType: "needs_confirmation",
          resumeStatusZh: "简历没有写明语言等级。",
          problemZh: "无法从当前材料确认语言等级。",
          reasonZh: "语言等级属于必须本人确认的硬门槛。",
          improvement: null,
        },
        {
          jdSegmentId: "jd-2",
          kind: "core",
          comparisonMode: "semantic",
          conceptLabelZh: "客户反馈分析",
          jdTerms: ["Analyse von Kundenfeedback"],
          importanceReasonZh: "这是岗位的核心日常任务。",
          priority: "important",
          translationZh: "支持客户反馈与客户体验指标的分析。",
          assessment: "partial",
          resumeSegmentId: "resume-4",
          profileFactIds: [],
          gapType: "missing_result",
          resumeStatusZh: "简历提到分析客户反馈，但没有说明结果。",
          problemZh: "缺少可验证的分析结果。",
          reasonZh: "有真实相关经历，但结果表述缺失。",
          improvement: {
            targetSection: "experience",
            targetExperienceZh: "客户反馈分析经历",
            focusAreas: ["result", "method"],
            synonymousJobLanguage: ["Handlungsempfehlungen"],
            needsConfirmation: false,
            directionZh: "核对这段分析产生了哪些真实结论和后续动作。",
          },
        },
      ],
    });

    const materialized = materializeResumeJDDifferenceOutput(compact, {
      jdSegments,
      resumeSegments,
      confirmedFactIds: new Set<string>(),
    });

    const verified = verifyAndNormalizeDifferenceOutput(materialized, {
      jdText,
      resumeText,
      confirmedFacts: [],
    });

    expect(verified.matched).toHaveLength(1);
    expect(verified.matched[0]!.resumeExcerpt).toBe(
      materialized.matched[0]!.resumeExcerpt,
    );
    expect(verified.issues).toHaveLength(2);
    expect(verified.issues.map((issue) => issue.jdOriginal)).toEqual(
      materialized.issues.map((issue) => issue.jdOriginal),
    );
    expect(verified.jobCore.gates).toHaveLength(1);
    expect(verified.directions).toHaveLength(1);
  });
});
