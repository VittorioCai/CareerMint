import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { RequirementsPanel } from "./requirements-panel";

const sourceText =
  "We are looking for a product leader with advanced SQL experience.\nThe role works with EU teams.";

const base = {
  analysisRunId: "22222222-2222-4222-8222-222222222222",
  applicationId: "33333333-3333-4333-8333-333333333333",
  sourceExcerpt: "Advanced SQL experience is required.",
  matchReason: null,
  evidence: [],
};

const requirements = [
  {
    ...base,
    id: "11111111-1111-4111-8111-111111111111",
    category: "skill" as const,
    text: "Core no evidence",
    priority: "core" as const,
    matchStatus: "none" as const,
    sortOrder: 0,
  },
  {
    ...base,
    id: "55555555-5555-4555-8555-555555555555",
    category: "responsibility" as const,
    text: "Core needs a decision",
    priority: "core" as const,
    matchStatus: "needs_user" as const,
    sortOrder: 1,
  },
  {
    ...base,
    id: "66666666-6666-4666-8666-666666666666",
    category: "preferred" as const,
    text: "Core partial match",
    priority: "core" as const,
    matchStatus: "partial" as const,
    matchReason: "The confirmed fact covers part of this requirement.",
    sortOrder: 2,
    evidence: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        factType: "skill" as const,
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
    id: "77777777-7777-4777-8777-777777777777",
    category: "language_work_authorization" as const,
    text: "Supporting no evidence",
    priority: "supporting" as const,
    matchStatus: "none" as const,
    sortOrder: 3,
  },
  {
    ...base,
    id: "88888888-8888-4888-8888-888888888888",
    category: "location_workplace" as const,
    text: "Supporting needs a decision",
    priority: "supporting" as const,
    matchStatus: "needs_user" as const,
    sortOrder: 4,
  },
  {
    ...base,
    id: "99999999-9999-4999-8999-999999999999",
    category: "hard_requirement" as const,
    text: "Already evidenced",
    priority: "core" as const,
    matchStatus: "evidence" as const,
    sortOrder: 5,
  },
];

describe("RequirementsPanel", () => {
  it("shows a compact summary and at most five approved priority rows without evidence open", () => {
    render(
      <RequirementsPanel
        requirements={requirements}
        sourceText={sourceText}
        sourceUrl="https://example.com/jobs/123"
      />,
    );

    expect(screen.getByRole("group", { name: "总要求 6" })).toBeVisible();
    expect(screen.getByRole("group", { name: "核心要求 4" })).toBeVisible();
    expect(screen.getByRole("group", { name: "有证据 1" })).toBeVisible();
    expect(screen.getByRole("group", { name: "需要关注 3" })).toBeVisible();

    const rows = screen.getAllByRole("button", { name: /核心|补充/ });
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Core no evidence"),
      expect.stringContaining("Core needs a decision"),
      expect.stringContaining("Core partial match"),
      expect.stringContaining("Supporting no evidence"),
      expect.stringContaining("Supporting needs a decision"),
    ]);
    expect(screen.queryByText("Advanced SQL analysis")).not.toBeInTheDocument();
    expect(screen.queryByText("Advanced SQL experience is required.")).not.toBeInTheDocument();
  });

  it("uses accessible disclosure rows and reveals reason, facts, then JD source evidence", async () => {
    const user = userEvent.setup();
    render(<RequirementsPanel requirements={requirements} sourceText={sourceText} />);

    const row = screen.getByRole("button", { name: /Core partial match/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    await user.click(row);

    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The confirmed fact covers part of this requirement.")).toBeVisible();
    expect(screen.getByText("Advanced SQL analysis")).toBeVisible();
    expect(screen.getByRole("link", { name: "查看职业档案" })).toHaveAttribute("href", "/profile");
    expect(screen.getByText("Advanced SQL experience is required.")).toBeVisible();

    const reason = screen.getByText("匹配理由");
    const facts = screen.getByText("已确认职业事实及来源");
    const excerpt = screen.getByText("JD 来源摘录");
    expect(reason.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(facts.compareDocumentPosition(excerpt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.keyboard("{Enter}");
    expect(row).toHaveAttribute("aria-expanded", "false");
  });

  it("collapses categories and rows by default, and exposes the immutable JD only in its view", async () => {
    const user = userEvent.setup();
    render(
      <RequirementsPanel
        requirements={requirements}
        sourceText={sourceText}
        sourceUrl="https://example.com/jobs/123"
      />,
    );

    await user.click(screen.getByRole("button", { name: "全部要求" }));
    expect(screen.getByRole("button", { name: /技能关键词/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: /Core no evidence/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /技能关键词/ }));
    expect(
      screen.getByRole("button", {
        name: /技能关键词.*1 项.*0 有证据.*0 部分匹配.*1 没有证据.*0 需判断/,
      }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /Core no evidence/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "JD 原文" }));
    expect(screen.getByText(/We are looking for a product leader/)).toBeVisible();
    expect(screen.getByRole("link", { name: "打开原岗位 ↗" })).toHaveAttribute(
      "href",
      "https://example.com/jobs/123",
    );
    expect(screen.queryByText("Core no evidence")).not.toBeInTheDocument();
  });

  it("returns focus to the local view control and closes an open row when switching views", async () => {
    const user = userEvent.setup();
    render(<RequirementsPanel requirements={requirements} sourceText={sourceText} />);

    const row = screen.getByRole("button", { name: /Core no evidence/ });
    await user.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");

    const allView = screen.getByRole("button", { name: "全部要求" });
    await user.click(allView);
    expect(allView).toHaveFocus();
    expect(screen.queryByText("JD 原文证据")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重点" }));
    expect(screen.getByRole("button", { name: /Core no evidence/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("keeps the actionable empty state in focus while making the JD source reachable", async () => {
    const user = userEvent.setup();
    const emptySource = "The original job description is retained before analysis.";
    render(
      <RequirementsPanel
        requirements={[]}
        sourceText={emptySource}
        sourceUrl="https://example.com/jobs/empty"
      />,
    );

    expect(screen.getByText("还没有结构化要求")).toBeVisible();
    expect(screen.getByText(/点击上方“开始分析 JD”/)).toBeVisible();
    expect(screen.queryByText(emptySource)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "JD 原文" }));
    expect(screen.getByText(emptySource)).toBeVisible();
    expect(screen.getByRole("link", { name: "打开原岗位 ↗" })).toHaveAttribute(
      "href",
      "https://example.com/jobs/empty",
    );
  });
});
