"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { JDAnalysisRun } from "./schemas";

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
  initialStatus,
  request = fetch,
  refresh,
}: {
  applicationId: string;
  initialStatus: JDAnalysisRun["status"] | null;
  request?: typeof fetch;
  refresh?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);

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
        setSuccess(
          body.reused
            ? "已复用相同 JD 与职业事实的分析结果。"
            : "分析完成，匹配结果已更新。",
        );
        (refresh ?? router.refresh)();
        return;
      }
      if (body.status === "running" || body.status === "queued") {
        setSuccess("分析任务正在进行，可以先离开，稍后回来刷新查看。");
        return;
      }
      const errorCode =
        typeof body.errorCode === "string"
          ? body.errorCode
          : "jd-analysis-failed";
      setError(failureMessages[errorCode] ?? failureMessages["jd-analysis-failed"]);
    } catch {
      setError("连接暂时失败，JD 和现有结果都已保留，请重试。");
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel =
    initialStatus === "failed"
      ? "重新分析 JD"
      : initialStatus === "succeeded"
        ? "重新检查匹配"
        : initialStatus === "running" || initialStatus === "queued"
          ? "检查分析状态"
          : "开始分析 JD";

  return (
    <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--mist-blue)] p-4 shadow-[3px_3px_0_var(--ink)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em]">
            JD 与职业事实匹配
          </p>
          <p className="mt-2 max-w-2xl text-xs font-semibold leading-5 text-[var(--ink-muted)]">
            只有点击后，系统才会发送这份 JD 和已确认职业事实给 AI。待确认事实不会成为匹配证据；相同资料会复用已有结果。
          </p>
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
