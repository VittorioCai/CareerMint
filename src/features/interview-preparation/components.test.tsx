// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  NewInterviewQuestionForm,
  QuestionPreparationCard,
} from "./components";
import type { InterviewQuestion } from "./schemas";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const applicationId = "11111111-1111-4111-8111-111111111111";
const questionId = "22222222-2222-4222-8222-222222222222";
const factId = "33333333-3333-4333-8333-333333333333";
const question: InterviewQuestion = {
  id: questionId,
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  category: "job_specific",
  canonicalKey: "how would you prioritize this roadmap",
  prompt: "How would you prioritize this roadmap?",
  source: "manual",
  preparationStatus: "not_started",
  answerOutline: null,
  notes: null,
  variants: [{ id: "variant", wording: "Walk me through your priorities." }],
  applicationLinks: [
    {
      applicationId,
      predicted: true,
      relevanceReason: "The role owns roadmap prioritization.",
      sourceExcerpt: "roadmap prioritization",
    },
  ],
  facts: [],
  createdAt: "2026-08-14T12:00:00.000Z",
  updatedAt: "2026-08-14T12:00:00.000Z",
};
const facts = [
  {
    id: factId,
    factType: "story" as const,
    title: "Roadmap tradeoff",
    organization: "Acme",
    description: "Prioritized a roadmap using customer evidence.",
    skills: ["Prioritization"],
    sourceExcerpt: "Prioritized a roadmap using customer evidence.",
  },
];

describe("interview preparation components", () => {
  it("labels predicted questions, variants, and reusable evidence clearly", async () => {
    const user = userEvent.setup();
    render(
      <QuestionPreparationCard
        question={question}
        applicationId={applicationId}
        availableFacts={facts}
        updateQuestion={vi.fn()}
        addVariant={vi.fn()}
      />,
    );

    expect(screen.getByText("可能会问")).toBeVisible();
    expect(screen.getByText("岗位特定")).toBeVisible();
    expect(screen.getByText("1 个问法变体")).toBeVisible();
    expect(
      screen.getByText("The role owns roadmap prioritization."),
    ).toBeVisible();
    expect(screen.getByText("JD 依据：").parentElement).toHaveTextContent(
      "roadmap prioritization",
    );
    await user.click(screen.getByText("准备回答"));
    expect(screen.getByText("Roadmap tradeoff")).toBeVisible();
  });

  it("saves status, outline, notes, and selected confirmed facts", async () => {
    const updateQuestion = vi.fn().mockResolvedValue({
      ok: true,
      questionId,
    });
    const user = userEvent.setup();
    render(
      <QuestionPreparationCard
        question={question}
        applicationId={applicationId}
        availableFacts={facts}
        updateQuestion={updateQuestion}
        addVariant={vi.fn()}
      />,
    );

    await user.click(screen.getByText("准备回答"));
    await user.selectOptions(screen.getByLabelText("准备状态"), "outlined");
    await user.type(
      screen.getByLabelText("回答提纲"),
      "Situation, action, result",
    );
    await user.type(screen.getByLabelText("练习笔记"), "Practice aloud");
    await user.click(screen.getByLabelText(/Roadmap tradeoff/));
    await user.click(screen.getByRole("button", { name: "保存准备记录" }));

    const submitted = updateQuestion.mock.calls[0][0] as FormData;
    expect(submitted.get("questionId")).toBe(questionId);
    expect(submitted.get("applicationId")).toBe(applicationId);
    expect(submitted.get("preparationStatus")).toBe("outlined");
    expect(submitted.get("answerOutline")).toBe("Situation, action, result");
    expect(submitted.getAll("factIds")).toEqual([factId]);
    expect(await screen.findByText("准备记录已保存。")).toBeVisible();
  });

  it("adds a job-specific question directly to the current application", async () => {
    const addQuestion = vi.fn().mockResolvedValue({
      ok: true,
      questionId,
    });
    const user = userEvent.setup();
    render(
      <NewInterviewQuestionForm
        applications={[]}
        fixedApplicationId={applicationId}
        addQuestion={addQuestion}
      />,
    );

    await user.type(
      screen.getByLabelText("核心问题"),
      "How would you approach this launch?",
    );
    await user.click(screen.getByRole("button", { name: "加入题库" }));

    const submitted = addQuestion.mock.calls[0][0] as FormData;
    expect(submitted.get("category")).toBe("job_specific");
    expect(submitted.get("applicationId")).toBe(applicationId);
    expect(await screen.findByText("问题已加入，通用准备记录可继续复用。")).toBeVisible();
  });
});
