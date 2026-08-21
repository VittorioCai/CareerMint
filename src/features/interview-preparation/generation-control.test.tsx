// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InterviewQuestionGenerationControl } from "./generation-control";
import type {
  InterviewQuestionGenerationCandidateRecord,
  InterviewQuestionGenerationRun,
} from "./generation-service";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const applicationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const candidateId = "33333333-3333-4333-8333-333333333333";
const questionId = "44444444-4444-4444-8444-444444444444";

const run: InterviewQuestionGenerationRun = {
  id: runId,
  applicationId,
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  inputHash: "a".repeat(64),
  schemaVersion: "interview-question-generation-v1",
  provider: "fake",
  model: "fake-v1",
  status: "succeeded",
  attemptCount: 1,
  result: {
    acceptedCandidateCount: 0,
    rejectedCandidateCount: 0,
    pendingCandidateCount: 1,
    ai: {
      provider: "fake",
      model: "fake-v1",
      requestId: null,
      usage: {
        inputCacheHitTokens: 0,
        inputCacheMissTokens: 12,
        outputTokens: 30,
      },
      priceScheduleVersion: "2026-08",
    },
    estimatedCost: {
      amount: 0.0012,
      currency: "USD",
      scheduleVersion: "2026-08",
      tier: "default",
    },
  },
  errorCode: null,
  errorMessage: null,
  requestId: null,
  updatedAt: "2026-08-21T00:00:00.000Z",
  createdAt: "2026-08-21T00:00:00.000Z",
};

const candidate: InterviewQuestionGenerationCandidateRecord = {
  id: candidateId,
  runId,
  applicationId,
  category: "job_specific",
  prompt: "How would you prioritize the launch roadmap?",
  sourceExcerpt: "prioritize the launch roadmap",
  relevanceReason: "岗位需要对发布路线图做出取舍。",
  status: "pending",
  questionId: null,
  sortOrder: 1,
};

const acceptAction = vi.fn().mockResolvedValue({
  ok: true,
  accepted: [{ candidateId, disposition: "new", questionId }],
});
const rejectAction = vi.fn().mockResolvedValue({ ok: true, rejectedCount: 1 });

describe("InterviewQuestionGenerationControl", () => {
  it("does not fetch until the user clicks generate", () => {
    const request = vi.fn();
    cleanup();
    render(
      <InterviewQuestionGenerationControl
        applicationId={applicationId}
        initialRun={null}
        initialCandidates={[]}
        acceptCandidates={acceptAction}
        rejectCandidates={rejectAction}
        request={request}
      />,
    );

    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText("先预览，再决定")).toBeVisible();
  });

  it("posts on click, renders candidate evidence, and keeps review actions disabled without selection", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({ runId, status: "succeeded", reused: false, errorCode: null }),
    );
    const user = userEvent.setup();
    cleanup();
    render(
      <InterviewQuestionGenerationControl
        applicationId={applicationId}
        initialRun={run}
        initialCandidates={[candidate]}
        acceptCandidates={acceptAction}
        rejectCandidates={rejectAction}
        request={request}
      />,
    );

    expect(screen.getByText("岗位特定")).toBeVisible();
    expect(screen.getByText("可能会问")).toBeVisible();
    expect(screen.getByText(candidate.prompt)).toBeVisible();
    expect(screen.getAllByText(/prioritize the launch roadmap/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(candidate.relevanceReason)).toBeVisible();
    expect(screen.getByRole("button", { name: "加入所选题库" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "暂不加入" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /生成岗位增量题/ }));
    expect(request).toHaveBeenCalledWith(
      `/api/applications/${applicationId}/interview/questions/generate`,
      { method: "POST" },
    );
  });

  it("hydrates newly generated candidates from refreshed server props without a second POST", async () => {
    const request = vi.fn().mockResolvedValue(
      Response.json({ runId, status: "succeeded", reused: false, errorCode: null }),
    );
    const refresh = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <InterviewQuestionGenerationControl
        applicationId={applicationId}
        initialRun={null}
        initialCandidates={[]}
        acceptCandidates={acceptAction}
        rejectCandidates={rejectAction}
        request={request}
        refresh={refresh}
      />,
    );

    await user.click(screen.getByRole("button", { name: "生成岗位增量题" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledOnce();

    rerender(
      <InterviewQuestionGenerationControl
        applicationId={applicationId}
        initialRun={run}
        initialCandidates={[candidate]}
        acceptCandidates={acceptAction}
        rejectCandidates={rejectAction}
        request={request}
        refresh={refresh}
      />,
    );

    expect(screen.getByText(candidate.prompt)).toBeVisible();
    expect(screen.getByRole("checkbox", { name: candidate.prompt })).toBeEnabled();
    expect(request).toHaveBeenCalledOnce();
  });

  it("accepts and rejects only checked pending candidates", async () => {
    const user = userEvent.setup();
    cleanup();
    render(
      <InterviewQuestionGenerationControl
        applicationId={applicationId}
        initialRun={run}
        initialCandidates={[candidate]}
        acceptCandidates={acceptAction}
        rejectCandidates={rejectAction}
        request={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /How would you prioritize/ }));
    await user.click(screen.getByRole("button", { name: "加入所选题库" }));
    await waitFor(() =>
      expect(acceptAction).toHaveBeenCalledWith(expect.any(FormData)),
    );
    const acceptedForm = acceptAction.mock.calls[0][0] as FormData;
    expect(acceptedForm.get("applicationId")).toBe(applicationId);
    expect(acceptedForm.getAll("candidateIds")).toEqual([candidateId]);
    expect(screen.getByText("已加入题库")).toBeVisible();

    cleanup();
    render(
      <InterviewQuestionGenerationControl
        applicationId={applicationId}
        initialRun={run}
        initialCandidates={[candidate]}
        acceptCandidates={acceptAction}
        rejectCandidates={rejectAction}
        request={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("checkbox", { name: /How would you prioritize/ }));
    await user.click(screen.getByRole("button", { name: "暂不加入" }));
    await waitFor(() => expect(rejectAction).toHaveBeenCalled());
    expect(screen.getByText("已跳过")).toBeVisible();
  });

  it("does not mark every selected candidate rejected when the RPC count is partial", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    const partialReject = vi.fn().mockResolvedValue({ ok: true, rejectedCount: 0 });
    render(
      <InterviewQuestionGenerationControl
        applicationId={applicationId}
        initialRun={run}
        initialCandidates={[candidate]}
        acceptCandidates={acceptAction}
        rejectCandidates={partialReject}
        request={vi.fn()}
        refresh={refresh}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: candidate.prompt }));
    await user.click(screen.getByRole("button", { name: "暂不加入" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.getByText("待决定")).toBeVisible();
    expect(screen.getByText(/状态已刷新/)).toBeVisible();
  });

  it("shows consent, reused, duplicate, failure, and cost states safely", async () => {
    const user = userEvent.setup();
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ status: "succeeded", runId, reused: true }),
      )
      .mockResolvedValueOnce(
        Response.json({ status: "failed", runId, errorCode: "secret-provider-detail" }),
      );
    render(
      <InterviewQuestionGenerationControl
        applicationId={applicationId}
        initialRun={run}
        initialCandidates={[candidate]}
        acceptCandidates={vi.fn().mockResolvedValue({
          ok: true,
          accepted: [
            { candidateId, disposition: "reused", questionId },
            { candidateId: "55555555-5555-4555-8555-555555555555", disposition: "duplicate-common", questionId: null },
          ],
        })}
        rejectCandidates={rejectAction}
        request={request}
        consentRequired
      />,
    );
    expect(screen.getByText(/允许 AI 数据处理/)).toBeVisible();
    expect(screen.getByRole("button", { name: /生成岗位增量题/ })).toBeDisabled();

    cleanup();
    render(
      <InterviewQuestionGenerationControl
        applicationId={applicationId}
        initialRun={run}
        initialCandidates={[candidate]}
        acceptCandidates={acceptAction}
        rejectCandidates={rejectAction}
        request={request}
      />,
    );
    await user.click(screen.getByRole("button", { name: /生成岗位增量题/ }));
    expect(await screen.findByText(/已复用/)).toBeVisible();
    expect(screen.getByText(/0\.0012 USD/)).toBeVisible();

    cleanup();
    render(
      <InterviewQuestionGenerationControl
        applicationId={applicationId}
        initialRun={{ ...run, status: "failed", errorCode: "secret-provider-detail", result: null }}
        initialCandidates={[]}
        acceptCandidates={acceptAction}
        rejectCandidates={rejectAction}
        request={request}
      />,
    );
    await user.click(screen.getByRole("button", { name: /重新生成岗位增量题/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("岗位增量题暂未完成");
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret-provider-detail");
  });
});
