"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { JDAnalysisRun } from "./schemas";

export type AnalysisSummary = {
  acceptedRequirementCount: number;
  estimatedCost: {
    amount: number;
    currency: "USD";
  } | null;
};

const failureMessages: Record<string, string> = {
  "jd-analysis-unavailable": "AI 暂未配置，JD 和现有结果都已保留。",
  "ai-provider-rate-limited": "AI 当前请求较多，请稍后重试。",
  "ai-provider-timeout": "本次分析超时，JD 已保留，可以重新尝试。",
  "jd-analysis-invalid-output": "AI 返回内容未通过安全校验，请重新尝试。",
  "jd-analysis-failed": "岗位分析暂未完成，请重新尝试。",
};

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

export function AnalysisControl({
  applicationId,
  analysisRunId,
  initialStatus,
  initialResult,
  request = fetch,
  refresh,
}: {
  applicationId: string;
  analysisRunId?: string | null;
  initialStatus: JDAnalysisRun["status"] | null;
  initialResult?: AnalysisSummary | null;
  request?: typeof fetch;
  refresh?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);
  const statusSourceKey = `${analysisRunId ?? "none"}:${initialStatus ?? "none"}`;
  const [statusState, setStatusState] = useState<{
    sourceKey: string;
    value: JDAnalysisRun["status"] | null;
  }>(() => ({ sourceKey: statusSourceKey, value: initialStatus }));

  if (statusState.sourceKey !== statusSourceKey) {
    setStatusState({ sourceKey: statusSourceKey, value: initialStatus });
  }

  const currentStatus = statusState.value;

  async function analyze() {
    if (busy) return;
    setBusy(true);
    setSuccess(null);
    setError(null);
    setNeedsConsent(false);

    try {
      const response = await request(
        `/api/applications/${applicationId}/analyze`,
        { method: "POST" },
      );
      const body = await responseBody(response);
      if (
        response.status === 403 &&
        body.error === "ai-processing-consent-required"
      ) {
        setNeedsConsent(true);
        setError("先在账户设置中允许 AI 数据处理，再回来分析这份 JD。");
        return;
      }
      if (!response.ok) throw new Error("jd-analysis-request-failed");

      if (body.status === "succeeded") {
        setStatusState((current) => ({ ...current, value: "succeeded" }));
        setSuccess(
          body.reused
            ? "已复用相同 JD 与职业事实的分析结果。"
            : "分析完成，匹配结果已更新。",
        );
        (refresh ?? router.refresh)();
        return;
      }
      if (body.status === "running" || body.status === "queued") {
        const nextStatus = body.status === "queued" ? "queued" : "running";
        setStatusState((current) => ({ ...current, value: nextStatus }));
        setSuccess("分析任务正在进行，可以先离开，稍后回来刷新查看。");
        return;
      }
      const errorCode =
        typeof body.errorCode === "string"
          ? body.errorCode
          : "jd-analysis-failed";
      setStatusState((current) => ({ ...current, value: "failed" }));
      setError(failureMessages[errorCode] ?? failureMessages["jd-analysis-failed"]);
    } catch {
      setError("连接暂时失败，JD 和现有结果都已保留，请重试。");
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel =
    currentStatus === "failed"
      ? "重新分析 JD"
      : currentStatus === "succeeded"
        ? "重新检查匹配"
        : currentStatus === "running" || currentStatus === "queued"
          ? "检查分析状态"
          : "开始分析 JD";

  const stateLabel =
    currentStatus === "succeeded"
      ? "最近一次分析已完成"
      : currentStatus === "failed"
        ? "上次分析未完成，可重试"
        : currentStatus === "running" || currentStatus === "queued"
          ? "分析任务进行中"
          : "尚未分析这份 JD";

  function formatCost(amount: number) {
    return amount.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  }

  return (
    <section className="dense-surface p-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm font-black">JD 与职业事实匹配</p>
            <p className="text-xs font-bold text-[var(--ink-muted)]">{stateLabel}</p>
          </div>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
            只有点击后，系统才会发送这份 JD 和已确认职业事实；相同资料会复用已有结果。
          </p>
          {initialResult ? (
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs font-bold text-[var(--ink-muted)]">
              <span>上次结果：{initialResult.acceptedRequirementCount} 项要求</span>
              {initialResult.estimatedCost ? (
                <span>
                  预计成本 ${formatCost(initialResult.estimatedCost.amount)} {initialResult.estimatedCost.currency}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="button-primary min-h-11 shrink-0 px-5 text-sm font-black disabled:cursor-wait disabled:opacity-60"
          disabled={busy}
          onClick={() => void analyze()}
        >
          {busy ? "正在分析…" : buttonLabel}
        </button>
      </div>

      <div aria-live="polite" className="mt-3">
        {success ? (
          <p role="status" className="text-sm font-bold text-[var(--ink)]">
            {success}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm font-bold text-[var(--error)]">
            {error}{" "}
            {needsConsent ? (
              <Link
                href="/settings/account"
                className="text-[var(--ink)] underline underline-offset-4"
              >
                前往账户设置
              </Link>
            ) : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}
