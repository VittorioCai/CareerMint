import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  JDGapAnalysisPanel,
  type JDGapAnalysisViewModel,
} from "./analysis-panel";

const ids = {
  run: "11111111-1111-4111-8111-111111111111",
  structure: "22222222-2222-4222-8222-222222222222",
  application: "33333333-3333-4333-8333-333333333333",
  user: "44444444-4444-4444-8444-444444444444",
  fact: "55555555-5555-4555-8555-555555555555",
};

function requirement(
  index: number,
  options: {
    coverage?: "complete" | "partial" | "none" | "needs_confirmation";
    impact?: "blocking" | "important" | "minor";
    evidence?: "direct" | "partial_direct" | "none" | "needs_confirmation";
  } = {},
) {
  const coverage = options.coverage ?? "none";
  const impact = options.impact ?? "important";
  const evidence = options.evidence ?? "none";
  const requirementId = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const criterionId = `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  return {
    id: requirementId,
    category: "hard_requirement" as const,
    requirementType: impact === "blocking" ? "required" as const : "core" as const,
    originalText: `Original requirement ${index}`,
    translationZh: `中文要求 ${index}`,
    sourceExcerpt: `Exact JD source excerpt for requirement ${index}.`,
    allowsEquivalent: true,
    explicitGate: impact === "blocking",
    sortOrder: index,
    result: {
      coverageStatus: coverage,
      impactLevel: impact,
      coveredCriterionCount: coverage === "complete" ? 1 : 0,
      missingCriterionCount: coverage === "complete" ? 0 : 1,
    },
    criteria: [{
      id: criterionId,
      groupKey: "g1",
      groupRule: "all" as const,
      kind: "tool" as const,
      originalText: `Original criterion ${index}`,
      translationZh: `中文条件 ${index}`,
      constraint: { operator: "none" as const, value: null, unit: null },
      sortOrder: 0,
      assessment: {
        resumeEvidenceStatus: evidence,
        resumeExcerpt: evidence === "direct" || evidence === "partial_direct"
          ? `Exact resume quote ${index}`
          : null,
        gapType: coverage === "complete" ? "none" as const : "missing_from_resume" as const,
        reasonZh: `差距原因 ${index}`,
        userQuestionZh: coverage === "complete" ? null : `补充问题 ${index}`,
        profileFacts: index === 1 ? [{
          id: ids.fact,
          title: "已确认的数据分析项目",
          description: "使用 SQL 完成月度分析。",
          sourceExcerpt: "SQL monthly analysis",
        }] : [],
      },
    }],
  };
}

function view(
  requirements: JDGapAnalysisViewModel["requirements"] = [
    requirement(1, { coverage: "none", impact: "blocking" }),
    requirement(2, { coverage: "partial", impact: "important", evidence: "partial_direct" }),
    requirement(3, { coverage: "complete", impact: "minor", evidence: "direct" }),
  ],
): JDGapAnalysisViewModel {
  return {
    run: {
      id: ids.run,
      sourceFilename: "Vittorio_Cai_CV.pdf",
    },
    structureRun: {
      id: ids.structure,
      jdTranslationZh: "岗位中文全文：负责客户洞察与数据分析。",
    },
    requirements,
  };
}

describe("JDGapAnalysisPanel", () => {
  it("leads with the selected resume, outcome counts, and gap-first tabs", () => {
    render(
      <JDGapAnalysisPanel
        view={view()}
        sourceText="Original full JD"
      />,
    );

    expect(screen.getByRole("heading", { name: "JD 差距分析" })).toBeVisible();
    expect(screen.getByText("Vittorio_Cai_CV.pdf")).toBeVisible();
    const summary = screen.getByLabelText("JD 差距摘要");
    expect(summary).toHaveTextContent("总要求3");
    expect(summary).toHaveTextContent("完全匹配1");
    expect(summary).toHaveTextContent("部分匹配1");
    expect(summary).toHaveTextContent("未覆盖1");
    expect(summary).toHaveTextContent("阻断项1");
    expect(screen.getByRole("tab", { name: "待补差距" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "全部要求" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "JD 内容" })).toBeVisible();
  });

  it("orders blocking before important before minor and incomplete statuses within groups", () => {
    const requirements = [
      requirement(1, { coverage: "partial", impact: "blocking", evidence: "partial_direct" }),
      requirement(2, { coverage: "none", impact: "blocking" }),
      requirement(3, { coverage: "needs_confirmation", impact: "blocking", evidence: "needs_confirmation" }),
      requirement(4, { coverage: "none", impact: "minor" }),
      requirement(5, { coverage: "none", impact: "important" }),
    ];
    render(<JDGapAnalysisPanel view={view(requirements)} sourceText="JD" />);

    const text = screen.getByLabelText("待补差距列表").textContent ?? "";
    expect(text.indexOf("阻断差距")).toBeLessThan(text.indexOf("重要差距"));
    expect(text.indexOf("重要差距")).toBeLessThan(text.indexOf("次要差距"));
    expect(text.indexOf("中文要求 2")).toBeLessThan(text.indexOf("中文要求 3"));
    expect(text.indexOf("中文要求 3")).toBeLessThan(text.indexOf("中文要求 1"));
  });

  it("shows Chinese before original and expands exact evidence, facts, criteria, reason, and question", async () => {
    const user = userEvent.setup();
    render(<JDGapAnalysisPanel view={view()} sourceText="Original full JD" />);

    const row = screen.getByTestId("gap-requirement-00000000-0000-4000-8000-000000000001");
    const rowText = row.textContent ?? "";
    expect(rowText.indexOf("中文要求 1")).toBeLessThan(rowText.indexOf("Original requirement 1"));
    const trigger = within(row).getByRole("button", { name: /中文要求 1/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(row).toHaveTextContent("中文条件 1");
    expect(row).toHaveTextContent("Original criterion 1");
    expect(row).toHaveTextContent("未在简历中找到直接证据");
    expect(row).toHaveTextContent("已确认的数据分析项目");
    expect(row).toHaveTextContent("缺少条件");
    expect(row).toHaveTextContent("简历未体现");
    expect(row).toHaveTextContent("差距原因 1");
    expect(row).toHaveTextContent("补充问题 1");
    expect(row).toHaveTextContent("Exact JD source excerpt for requirement 1.");
  });

  it("keeps every incomplete item reachable when a group initially shows five", async () => {
    const user = userEvent.setup();
    const requirements = Array.from({ length: 7 }, (_, index) =>
      requirement(index + 1, { coverage: "none", impact: "important" }),
    );
    render(<JDGapAnalysisPanel view={view(requirements)} sourceText="JD" />);

    expect(screen.getByText("中文要求 5")).toBeVisible();
    expect(screen.queryByText("中文要求 6")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "还有 2 条，展开全部" }));
    expect(screen.getByText("中文要求 6")).toBeVisible();
    expect(screen.getByText("中文要求 7")).toBeVisible();
  });

  it("places completed requirements last in a collapsed section on the all tab", async () => {
    const user = userEvent.setup();
    render(<JDGapAnalysisPanel view={view()} sourceText="JD" />);
    await user.click(screen.getByRole("tab", { name: "全部要求" }));

    const completed = screen.getByText("完整匹配（1）").closest("details");
    expect(completed).not.toHaveAttribute("open");
    expect(screen.getByText("中文要求 1")).toBeVisible();
  });

  it("shows translated JD first and keeps the original folded", async () => {
    const user = userEvent.setup();
    render(<JDGapAnalysisPanel view={view()} sourceText="Original full JD" />);
    await user.click(screen.getByRole("tab", { name: "JD 内容" }));

    expect(screen.getByText(/岗位中文全文/)).toBeVisible();
    const original = screen.getByText("查看 JD 原文").closest("details");
    expect(original).not.toHaveAttribute("open");
    expect(original).toHaveTextContent("Original full JD");
  });

  it("renders V2 only as an explicit legacy view without fabricating V3 fields", () => {
    render(
      <JDGapAnalysisPanel
        view={null}
        sourceText="Old JD"
        legacyPanel={<section aria-label="旧版要求">旧版匹配列表</section>}
      />,
    );

    expect(screen.getByText("这是旧版分析，请重新分析以查看详细差距。")).toBeVisible();
    expect(screen.getByLabelText("旧版要求")).toBeVisible();
    expect(screen.queryByLabelText("JD 差距摘要")).not.toBeInTheDocument();
    expect(screen.queryByText("阻断差距")).not.toBeInTheDocument();
  });
});
