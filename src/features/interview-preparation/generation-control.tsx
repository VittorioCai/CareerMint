"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { InterviewGenerationActionState } from "./generation-actions";
import type {
  InterviewQuestionGenerationCandidateRecord,
  InterviewQuestionGenerationRun,
} from "./generation-service";
import { INTERVIEW_CATEGORY_LABELS } from "./schemas";

type BoundAction = (
  formData: FormData,
) => Promise<InterviewGenerationActionState>;

type CandidateOverride = Partial<
  Pick<InterviewQuestionGenerationCandidateRecord, "status" | "questionId">
>;

const failureMessages: Record<string, string> = {
  "interview-question-generation-unavailable": "AI 暂未配置，岗位资料已保留。",
  "interview-question-generation-invalid-output": "AI 返回内容未通过安全校验，请重新尝试。",
  "interview-question-generation-provider-error": "岗位增量题暂未完成，请稍后重试。",
  "interview-question-generation-request-failed": "连接暂时失败，岗位资料已保留，请重试。",
};

const candidateStatusLabels = {
  pending: "待决定",
  accepted: "已加入题库",
  rejected: "已跳过",
} as const;

async function responseBody(response: Response) {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function safeFailure(code: unknown) {
  return typeof code === "string"
    ? failureMessages[code] ?? failureMessages["interview-question-generation-provider-error"]
    : failureMessages["interview-question-generation-provider-error"];
}

function costLabel(run: InterviewQuestionGenerationRun | null) {
  const cost = run?.result?.estimatedCost;
  return cost ? `预计成本 ${cost.amount} ${cost.currency}` : null;
}

export function InterviewQuestionGenerationControl({
  applicationId,
  initialRun,
  initialCandidates,
  acceptCandidates,
  rejectCandidates,
  request = fetch,
  refresh,
  consentRequired = false,
}: {
  applicationId: string;
  initialRun: InterviewQuestionGenerationRun | null;
  initialCandidates: InterviewQuestionGenerationCandidateRecord[];
  acceptCandidates: BoundAction;
  rejectCandidates: BoundAction;
  request?: typeof fetch;
  refresh?: () => void;
  consentRequired?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"generate" | "accept" | "reject" | null>(null);
  const run = initialRun;
  const [candidateOverrides, setCandidateOverrides] = useState<
    Record<string, CandidateOverride>
  >({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const candidates = initialCandidates.map((candidate) => ({
    ...candidate,
    ...candidateOverrides[candidate.id],
  }));

  async function generate() {
    if (busy || consentRequired) return;
    setBusy("generate");
    setSuccess(null);
    setError(null);
    try {
      const response = await request(
        `/api/applications/${applicationId}/interview/questions/generate`,
        { method: "POST" },
      );
      const body = await responseBody(response);
      if (response.status === 403 && body.error === "ai-processing-consent-required") {
        setError("先在账户设置中允许 AI 数据处理，再回来生成岗位增量题。");
        return;
      }
      if (!response.ok) throw new Error("interview-question-generation-request-failed");
      if (body.status === "succeeded") {
        setSuccess(body.reused ? "已复用相同资料的生成结果，请先预览，再决定。" : "生成完成，请先预览，再决定是否加入题库。");
        (refresh ?? router.refresh)();
        return;
      }
      if (body.status === "running" || body.status === "queued") {
        setSuccess("生成任务正在进行，稍后刷新即可查看候选题。");
        return;
      }
      if (body.status === "failed") {
        setError(safeFailure(body.errorCode));
        return;
      }
      throw new Error("interview-question-generation-request-failed");
    } catch {
      setError("连接暂时失败，岗位资料已保留，请重试。");
    } finally {
      setBusy(null);
    }
  }

  function toggleCandidate(candidateId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  async function acceptSelected() {
    if (busy || selected.size === 0) return;
    setBusy("accept");
    setError(null);
    setSuccess(null);
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    for (const candidateId of selected) formData.append("candidateIds", candidateId);
    try {
      const result = await acceptCandidates(formData);
      if (!result.ok || !("accepted" in result)) {
        setError("暂时无法加入题库，请稍后重试。");
        return;
      }
      const newCount = result.accepted.filter((item) => item.disposition === "new").length;
      const reusedCount = result.accepted.filter((item) => item.disposition === "reused").length;
      const duplicateCount = result.accepted.filter((item) => item.disposition === "duplicate-common").length;
      setCandidateOverrides((current) => {
        const next = { ...current };
        for (const decision of result.accepted) {
          next[decision.candidateId] = {
            ...next[decision.candidateId],
            status:
              decision.disposition === "duplicate-common"
                ? "rejected"
                : "accepted",
            questionId: decision.questionId,
          };
        }
        return next;
      });
      setSelected(new Set());
      setSuccess(`已处理 ${result.accepted.length} 道：新增 ${newCount}，复用 ${reusedCount}，通用题重复 ${duplicateCount}。`);
      (refresh ?? router.refresh)();
    } catch {
      setError("暂时无法加入题库，请稍后重试。");
    } finally {
      setBusy(null);
    }
  }

  async function rejectSelected() {
    if (busy || selected.size === 0 || !run) return;
    setBusy("reject");
    setError(null);
    setSuccess(null);
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("runId", run.id);
    for (const candidateId of selected) formData.append("candidateIds", candidateId);
    try {
      const result = await rejectCandidates(formData);
      if (!result.ok || !("rejectedCount" in result)) {
        setError("暂时无法跳过候选题，请稍后重试。");
        return;
      }
      if (result.rejectedCount !== selected.size) {
        setSelected(new Set());
        setSuccess("候选状态已刷新，请重新确认当前列表。");
        (refresh ?? router.refresh)();
        return;
      }
      setCandidateOverrides((current) => {
        const next = { ...current };
        for (const candidateId of selected) {
          next[candidateId] = {
            ...next[candidateId],
            status: "rejected",
          };
        }
        return next;
      });
      setSelected(new Set());
      setSuccess(`已跳过 ${result.rejectedCount} 道候选题。`);
      (refresh ?? router.refresh)();
    } catch {
      setError("暂时无法跳过候选题，请稍后重试。");
    } finally {
      setBusy(null);
    }
  }

  const buttonLabel =
    busy === "generate"
      ? "正在生成…"
      : run?.status === "failed"
        ? "重新生成岗位增量题"
        : "生成岗位增量题";
  const cost = costLabel(run);
  const initialFailure = run?.status === "failed" ? safeFailure(run.errorCode) : null;

  return (
    <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--coral)] p-4 shadow-[3px_3px_0_var(--ink)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em]">AI 岗位增量题</p>
          <h2 className="heading-font mt-2 text-2xl font-black">先预览，再决定</h2>
          <p className="mt-2 max-w-2xl text-xs font-semibold leading-5 text-[var(--ink)]">
            仅使用 JD、结构化要求和通用题提示。候选不会自动写入题库，最多生成 6 道；每道都只是基于 JD 的准备建议。
          </p>
        </div>
        <button
          type="button"
          className="button-primary min-h-11 shrink-0 px-5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
          disabled={busy !== null || consentRequired}
          onClick={() => void generate()}
        >
          {buttonLabel}
        </button>
      </div>

      {consentRequired ? (
        <p role="alert" className="mt-3 text-sm font-bold text-[var(--ink)]">
          生成岗位增量题前，需要先允许 AI 数据处理。{" "}
          <Link href="/settings/account" className="underline underline-offset-4">
            前往账户设置
          </Link>
        </p>
      ) : null}

      {cost ? <p className="mt-3 text-xs font-black text-[var(--ink)]">{cost}</p> : null}
      <div aria-live="polite" className="mt-3">
        {success ? <p role="status" className="text-sm font-bold text-[var(--ink)]">{success}</p> : null}
        {error || initialFailure ? (
          <p role="alert" className="text-sm font-bold text-[var(--ink)]">
            {error ?? initialFailure}
          </p>
        ) : null}
      </div>

      {candidates.length ? (
        <div className="mt-5 space-y-3" aria-label="岗位增量题候选">
          {candidates.map((candidate) => {
            const pending = candidate.status === "pending";
            return (
              <article key={candidate.id} className="rounded-xl border border-[var(--line)] bg-white p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-5 accent-[var(--ink)]"
                    aria-label={candidate.prompt}
                    checked={selected.has(candidate.id)}
                    disabled={!pending || busy !== null}
                    onChange={() => toggleCandidate(candidate.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="status-chip bg-[var(--mist-blue)]">{INTERVIEW_CATEGORY_LABELS[candidate.category]}</span>
                      <span className="status-chip bg-[var(--coral)] text-white">可能会问</span>
                      <span className="status-chip bg-white">{candidateStatusLabels[candidate.status]}</span>
                    </div>
                    <h3 className="heading-font mt-3 text-lg font-black leading-7">{candidate.prompt}</h3>
                    <p className="mt-3 rounded-lg bg-[var(--canvas)] px-3 py-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
                      <span className="font-black text-[var(--ink)]">JD 依据：</span>“{candidate.sourceExcerpt}”
                    </p>
                    <p className="mt-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
                      <span className="font-black text-[var(--ink)]">为什么相关：</span>{candidate.relevanceReason}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              className="button-primary min-h-10 px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selected.size === 0 || busy !== null}
              onClick={() => void acceptSelected()}
            >
              {busy === "accept" ? "正在加入…" : "加入所选题库"}
            </button>
            <button
              type="button"
              className="button-secondary min-h-10 px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selected.size === 0 || busy !== null}
              onClick={() => void rejectSelected()}
            >
              {busy === "reject" ? "正在跳过…" : "暂不加入"}
            </button>
          </div>
        </div>
      ) : run?.status === "succeeded" && candidates.length === 0 ? (
        <p className="mt-5 rounded-xl border border-[var(--line)] bg-white p-4 text-sm font-bold text-[var(--ink-muted)]">
          这次没有留下可预览的岗位增量题。
        </p>
      ) : null}
    </section>
  );
}
