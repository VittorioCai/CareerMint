import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ResumeEditor } from "./resume-editor";
import type { ResumeSuggestionRecord } from "./schemas";

const applicationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

const suggestions: ResumeSuggestionRecord[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    runId,
    applicationId,
    section: "achievement",
    content:
      "Improved checkout conversion by 18% through SQL-led funnel analysis.",
    reason: "Highlights evidence for the core SQL requirement.",
    decision: "pending",
    reviewedContent: null,
    sortOrder: 0,
    facts: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        factType: "achievement",
        title: "Checkout conversion improvement",
        organization: "Acme GmbH",
        description: "Improved checkout conversion by 18%.",
        skills: ["SQL"],
        sourceExcerpt: "Improved checkout conversion by 18%.",
      },
    ],
    requirements: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        category: "skill",
        text: "Advanced SQL",
        priority: "core",
      },
    ],
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    runId,
    applicationId,
    section: "skills",
    content: "SQL · Funnel analysis",
    reason: "Surfaces directly relevant skills.",
    decision: "accepted",
    reviewedContent: null,
    sortOrder: 1,
    facts: [],
    requirements: [],
  },
];

const noOpReview = vi.fn().mockResolvedValue({ ok: true });
const noOpSave = vi.fn().mockResolvedValue({ ok: false });

describe("ResumeEditor", () => {
  it("renders structure, document preview, and traceable evidence", () => {
    render(
      <ResumeEditor
        applicationId={applicationId}
        runId={runId}
        companyName="Acme GmbH"
        roleTitle="Product Manager"
        suggestions={suggestions}
        versions={[]}
        reviewSuggestion={noOpReview}
        saveVersion={noOpSave}
      />,
    );

    expect(screen.getByRole("heading", { name: "简历结构" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "正文预览" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "建议与证据" })).toBeVisible();
    expect(screen.getByText("Advanced SQL")).toBeVisible();
    expect(screen.getByText("Improved checkout conversion by 18%.")).toBeVisible();
    expect(screen.getByText("来源：原始简历文字")).toBeVisible();
    expect(screen.getAllByText("待审核").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已接受").length).toBeGreaterThan(0);
  });

  it("accepts edited wording while preserving the original evidence links", async () => {
    const reviewSuggestion = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(
      <ResumeEditor
        applicationId={applicationId}
        runId={runId}
        companyName="Acme GmbH"
        roleTitle="Product Manager"
        suggestions={suggestions}
        versions={[]}
        reviewSuggestion={reviewSuggestion}
        saveVersion={noOpSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "编辑后接受" }));
    const editor = screen.getByRole("textbox", { name: "编辑建议文本" });
    await user.clear(editor);
    await user.type(
      editor,
      "Improved checkout conversion by 18% using SQL funnel analysis.",
    );
    await user.click(screen.getByRole("button", { name: "保存并接受" }));

    expect(reviewSuggestion).toHaveBeenCalledWith({
      applicationId,
      suggestionId: suggestions[0].id,
      decision: "accepted",
      reviewedContent:
        "Improved checkout conversion by 18% using SQL funnel analysis.",
    });
    expect(
      (
        await screen.findAllByText(
          "Improved checkout conversion by 18% using SQL funnel analysis.",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Advanced SQL")).toBeVisible();
  });

  it("creates a new immutable version from accepted items", async () => {
    const saveVersion = vi.fn().mockResolvedValue({
      ok: true,
      versionId: "77777777-7777-4777-8777-777777777777",
      versionNumber: 2,
    });
    const navigate = vi.fn();
    const user = userEvent.setup();
    render(
      <ResumeEditor
        applicationId={applicationId}
        runId={runId}
        companyName="Acme GmbH"
        roleTitle="Product Manager"
        suggestions={suggestions}
        versions={[]}
        reviewSuggestion={noOpReview}
        saveVersion={saveVersion}
        navigate={navigate}
      />,
    );

    await user.selectOptions(screen.getByLabelText("简历模板"), "modern");
    await user.click(screen.getByRole("button", { name: "保存为新版本" }));

    expect(saveVersion).toHaveBeenCalledWith({
      applicationId,
      runId,
      template: "modern",
    });
    expect(navigate).toHaveBeenCalledWith(
      `/applications/${applicationId}/resume/77777777-7777-4777-8777-777777777777`,
    );
  });
});
