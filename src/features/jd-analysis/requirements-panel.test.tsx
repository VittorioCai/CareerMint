import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RequirementsPanel } from "./requirements-panel";

const base = {
  id: "11111111-1111-4111-8111-111111111111",
  analysisRunId: "22222222-2222-4222-8222-222222222222",
  applicationId: "33333333-3333-4333-8333-333333333333",
  sourceExcerpt: "Advanced SQL experience is required.",
  priority: "core" as const,
  matchReason: null,
  sortOrder: 0,
  evidence: [],
};

describe("RequirementsPanel", () => {
  it("renders every match state as text and shows traceable confirmed evidence", () => {
    render(
      <RequirementsPanel
        requirements={[
          {
            ...base,
            category: "skill",
            text: "Advanced SQL",
            matchStatus: "evidence",
            matchReason: "The confirmed skill directly names SQL.",
            evidence: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                factType: "skill",
                title: "SQL",
                organization: null,
                description: "Advanced SQL analysis",
                skills: ["SQL"],
                sourceExcerpt: "SQL, experimentation and funnel analysis",
              },
            ],
          },
          {
            ...base,
            id: "55555555-5555-4555-8555-555555555555",
            category: "responsibility",
            text: "Lead product discovery",
            matchStatus: "partial",
          },
          {
            ...base,
            id: "66666666-6666-4666-8666-666666666666",
            category: "preferred",
            text: "Enterprise background",
            matchStatus: "none",
          },
          {
            ...base,
            id: "77777777-7777-4777-8777-777777777777",
            category: "language_work_authorization",
            text: "EU work authorization",
            matchStatus: "needs_user",
          },
        ]}
      />,
    );

    for (const label of ["有证据", "部分匹配", "没有证据", "需要用户判断"]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(screen.getByRole("heading", { name: "技能关键词" })).toBeVisible();
    expect(screen.getByText("Advanced SQL analysis")).toBeVisible();
    expect(
      screen.getByText("SQL, experimentation and funnel analysis"),
    ).toBeVisible();
    expect(screen.getAllByText("JD 原文证据")).toHaveLength(4);
  });

  it("gives an actionable empty state", () => {
    render(<RequirementsPanel requirements={[]} />);

    expect(screen.getByText("还没有结构化要求")).toBeVisible();
    expect(screen.getByText(/点击上方“开始分析 JD”/)).toBeVisible();
  });
});
