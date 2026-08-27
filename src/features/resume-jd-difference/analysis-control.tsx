"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ResumeAssetOption } from "@/features/resume-gaps/baseline-selector";

type RunStatus = "queued" | "running" | "succeeded" | "failed";
type Freshness = "current" | "stale" | "missing";

export type ResumeJDDifferenceControlRun = {
  status: RunStatus;
  errorCode: string | null;
};

type AnalyzeResponse = {
  status?: unknown;
  reused?: unknown;
  freshness?: unknown;
  errorCode?: unknown;
  error?: unknown;
};

export type ResumeJDDifferenceAnalysisControlProps = {
  applicationId: string;
  asset: ResumeAssetOption | null;
  initialRun: ResumeJDDifferenceControlRun | null;
  freshness: Freshness;
  hasPreviousResult?: boolean;
  request?: typeof fetch;
  refresh?: () => void;
};

const errorCopy: Record<string, string> = {
  "ai-processing-consent-required":
    "需要先允许 AI 处理 JD 与简历，授权后再试。",
  "resume-source-required": "请先选择一份对照简历。",
  "resume-source-changed": "对照简历已经变化，请刷新页面后重试。",
  "resume-text-insufficient":
    "没有读到足够的简历文字。请回到简历页预览，必要时重新上传。",
  "resume-parse-failed":
    "无法读取这份简历。请回到简历页检查预览或重新上传。",
  "source-download-failed": "无法下载这份私有简历，请稍后重试。",
  "resume-jd-difference-unavailable": "分析服务尚未配置或暂时不可用。",
  "resume-jd-difference-invalid-output":
    "分析结果没有通过完整性检查，请重新分析。",
  "resume-jd-difference-evidence-invalid":
    "分析中的引用无法回查，因此结果没有发布。请重新分析。",
  "ai-timeout": "分析服务响应超时，请稍后重新分析。",
  "ai-rate-limited": "分析请求较多，请稍后再试。",
  "ai-request-failed": "分析服务请求失败，请稍后再试。",
  "resume-jd-difference-request-failed": "分析请求失败，请稍后重试。",
  "resume-jd-difference-failed": "分析没有完成，请重新尝试。",
  "network-error": "网络暂时不可用，请检查连接后重试。",
};

async function responseBody(response: Response): Promise<AnalyzeResponse> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object"
      ? (value as AnalyzeResponse)
      : {};
  } catch {
    return {};
  }
}

function returnedError(body: AnalyzeResponse) {
  return typeof body.errorCode === "string"
    ? body.errorCode
    : typeof body.error === "string"
      ? body.error
      : null;
}

export function ResumeJDDifferenceAnalysisControl(
  props: ResumeJDDifferenceAnalysisControlProps,
) {
  const identity = [
    props.asset?.id ?? "none",
    props.initialRun?.status ?? "none",
    props.initialRun?.errorCode ?? "none",
    props.freshness,
  ].join(":");
  return <AnalysisControlState key={identity} {...props} />;
}

function AnalysisControlState({
  applicationId,
  asset,
  initialRun,
  freshness,
  hasPreviousResult = false,
  request = fetch,
  refresh,
}: ResumeJDDifferenceAnalysisControlProps) {
  const router = useRouter();
  const refreshPage = refresh ?? router.refresh;
  const initialStatus =
    freshness === "stale" ? "stale" : initialRun?.status ?? "idle";
  const [status, setStatus] = useState<
    "idle" | "submitting" | RunStatus | "stale"
  >(initialStatus);
  const [error, setError] = useState<string | null>(
    initialRun?.status === "failed" ? initialRun.errorCode : null,
  );
  const [reused, setReused] = useState(false);

  if (!asset) {
    return (
      <section className="dense-surface overflow-hidden" aria-labelledby="difference-control-title">
        <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              Resume baseline
            </p>
            <h2 id="difference-control-title" className="heading-font mt-1 text-2xl font-black">
              先确定这次要对照的简历
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--ink-muted)]">
              差异分析只比较当前 JD 与你选定的那一版简历，职业档案仅作为已确认补充。
            </p>
          </div>
          <Link
            href={`/applications/${applicationId}?tab=resume`}
            className="button-primary inline-flex min-h-11 items-center justify-center px-5 text-sm font-black"
          >
            先选择对照简历
          </Link>
        </div>
      </section>
    );
  }
  const selectedAsset = asset;

  const busy = status === "submitting" || status === "queued" || status === "running";
  const completed = status === "succeeded";
  const stale = status === "stale";
  const visibleError = error
    ? errorCopy[error] ?? "分析没有完成，请重新尝试。"
    : null;

  async function analyze() {
    if (busy) return;
    setStatus("submitting");
    setError(null);
    setReused(false);
    try {
      const response = await request(
        `/api/applications/${applicationId}/resume-jd-difference/analyze`,
        {
          method: "POST",
          headers: { "x-resume-source-asset-id": selectedAsset.id },
        },
      );
      const body = await responseBody(response);
      const code = returnedError(body);
      if (!response.ok && typeof body.status !== "string") {
        throw new Error(code ?? "network-error");
      }
      if (body.status === "queued" || body.status === "running") {
        setStatus(body.status);
        return;
      }
      if (body.status === "failed") {
        setStatus("failed");
        setError(code ?? "resume-jd-difference-failed");
        return;
      }
      if (body.status !== "succeeded") {
        throw new Error(code ?? "resume-jd-difference-request-failed");
      }
      setStatus("succeeded");
      setReused(body.reused === true);
      refreshPage();
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : "network-error";
      setStatus("failed");
      setError(
        Object.prototype.hasOwnProperty.call(errorCopy, code)
          ? code
          : "network-error",
      );
    }
  }

  const statusCopy = busy
    ? "正在分析岗位与简历差异"
    : stale
      ? "材料已变化，请重新分析"
      : completed
        ? "分析已完成"
        : status === "failed"
          ? "本次分析没有完成"
          : "准备分析当前 JD 与这份简历";

  return (
    <section
      className="sticker-border overflow-hidden bg-[var(--mist-blue)] shadow-[5px_5px_0_var(--ink)]"
      aria-labelledby="difference-control-title"
      aria-busy={busy}
    >
      <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="status-chip bg-white">
              {completed ? "✓" : stale ? "!" : busy ? "◌" : "→"} {statusCopy}
            </span>
            {reused ? (
              <span className="text-xs font-black text-[var(--ink-muted)]">
                已复用相同材料的结果
              </span>
            ) : null}
          </div>
          <h2 id="difference-control-title" className="heading-font mt-3 text-2xl font-black">
            对照：{asset.originalName}
          </h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[var(--ink-muted)]">
            一次分析会同时生成岗位核心判断、完整差异和后续完善方向；不会修改简历。
          </p>
          {visibleError ? (
            <p role="alert" className="mt-3 text-sm font-black text-[var(--error)]">
              {visibleError}
            </p>
          ) : null}
          {hasPreviousResult && (busy || status === "failed") ? (
            <Link
              href={`/applications/${applicationId}?tab=difference&result=previous`}
              className="mt-3 inline-block text-sm font-black underline decoration-2 underline-offset-4"
            >
              查看上次结果
            </Link>
          ) : null}
        </div>
        <button
          type="button"
          className="button-primary min-h-11 min-w-36 px-5 text-sm font-black disabled:cursor-wait disabled:opacity-65"
          disabled={busy}
          onClick={() => void analyze()}
        >
          {busy ? "正在分析…" : completed || stale ? "重新分析" : "开始差异分析"}
        </button>
      </div>
    </section>
  );
}
