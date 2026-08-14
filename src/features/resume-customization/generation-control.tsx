"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ResumeGenerationRun } from "./schemas";

const failureMessages: Record<string, string> = {
  "resume-generation-unavailable":
    "AI 暂未配置，现有版本和职业事实都已保留。",
  "ai-provider-rate-limited": "AI 当前请求较多，请稍后重试。",
  "ai-provider-timeout": "本次生成超时，现有资料已保留，可以重新尝试。",
  "resume-generation-invalid-output":
    "AI 返回内容没有通过事实安全校验，请重新尝试。",
  "resume-generation-failed": "简历建议暂未完成，请重新尝试。",
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

export function ResumeGenerationControl({
  applicationId,
  initialStatus,
  request = fetch,
  navigate,
}: {
  applicationId: string;
  initialStatus: ResumeGenerationRun["status"] | null;
  request?: typeof fetch;
  navigate?: (href: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConsent, setNeedsConsent] = useState(false);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNeedsConsent(false);

    try {
      const response = await request(
        `/api/applications/${applicationId}/resume/generate`,
        { method: "POST" },
      );
      const body = await responseBody(response);
      if (
        response.status === 403 &&
        body.error === "ai-processing-consent-required"
      ) {
        setNeedsConsent(true);
        setError("先在账户设置中允许 AI 数据处理，再回来生成简历建议。");
        return;
      }
      if (response.status === 409) {
        setError(
          body.error === "confirmed-facts-required"
            ? "先在职业档案确认至少一条事实，待确认内容不能写进简历。"
            : "先在 JD 标签完成岗位分析，再根据要求生成简历建议。",
        );
        return;
      }
      if (!response.ok) throw new Error("resume-generation-request-failed");

      if (body.status === "succeeded" && typeof body.runId === "string") {
        const href = `/applications/${applicationId}/resume/${body.runId}`;
        (navigate ?? router.push)(href);
        return;
      }
      if (body.status === "running" || body.status === "queued") {
        setError("生成任务仍在进行，请稍后再检查。现有资料不会丢失。");
        return;
      }
      const errorCode =
        typeof body.errorCode === "string"
          ? body.errorCode
          : "resume-generation-failed";
      setError(
        failureMessages[errorCode] ?? failureMessages["resume-generation-failed"],
      );
    } catch {
      setError("连接暂时失败，现有版本和资料都已保留，请重试。");
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel =
    initialStatus === "failed"
      ? "重新生成简历建议"
      : initialStatus === "succeeded"
        ? "按最新资料重新生成"
        : initialStatus === "running" || initialStatus === "queued"
          ? "检查生成状态"
          : "生成岗位简历建议";

  return (
    <section className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--cream)] p-4 shadow-[3px_3px_0_var(--ink)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em]">
            JD 定制简历
          </p>
          <p className="mt-2 max-w-2xl text-xs font-semibold leading-5 text-[var(--ink-muted)]">
            只有点击后，系统才会把 JD、结构化要求和已确认职业事实发送给 AI。建议不会自动写入版本，需要你逐条审核。
          </p>
        </div>
        <button
          type="button"
          className="button-primary min-h-11 shrink-0 px-5 text-sm font-black disabled:cursor-wait disabled:opacity-60"
          disabled={busy}
          onClick={() => void generate()}
        >
          {busy ? "正在生成…" : buttonLabel}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 text-sm font-bold text-[var(--error)]"
        >
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
    </section>
  );
}
