"use client";

import { useState, useTransition } from "react";

import type { SourceAssetStatus } from "./asset-usage";

export const resumeFileDeleteErrorCopy: Record<number, string> = {
  409: "这个文件还在被其他记录占用，暂时无法删除。",
};

// What the user gives up, stated before they commit rather than discovered
// after. The file itself is the only thing that goes.
function usageCopy(applicationCount: number, confirmedFactCount: number) {
  if (applicationCount && confirmedFactCount) {
    return `这份简历是 ${applicationCount} 份投递的对照简历，也是 ${confirmedFactCount} 条已确认职业事实的来源。删除后这些投递需要重新选择对照简历，已完成的分析结果仍可查看。`;
  }
  if (applicationCount) {
    return `这份简历是 ${applicationCount} 份投递的对照简历。删除后这些投递需要重新选择对照简历，已完成的分析结果仍可查看。`;
  }
  if (confirmedFactCount) {
    return `这份简历是 ${confirmedFactCount} 条已确认职业事实的来源。删除后这些事实仍然保留，只是不再关联原文件。`;
  }
  return "目前没有投递或职业事实引用这个文件。";
}

export function ResumeFileDeleteControl({
  assetId,
  originalName,
  status,
  applicationCount,
  confirmedFactCount,
  onDeleted,
}: {
  assetId: string;
  originalName: string;
  status: SourceAssetStatus;
  applicationCount: number;
  confirmedFactCount: number;
  onDeleted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitDeletion() {
    setError(null);
    startTransition(async () => {
      let response: Response;
      try {
        response = await fetch(`/api/source-assets/${assetId}`, {
          method: "DELETE",
        });
      } catch {
        setError("网络连接中断，文件没有被删除。");
        return;
      }

      // A 404 means someone already removed it — the user's intent is met.
      if (response.ok || response.status === 404) {
        onDeleted();
        return;
      }
      setError(resumeFileDeleteErrorCopy[response.status] ?? "文件没有删除成功，请重试。");
    });
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setExpanded(true);
        }}
        className="button-secondary min-h-9 px-3 text-xs font-semibold text-[var(--danger)]"
      >
        删除 {originalName}
      </button>
    );
  }

  return (
    <div
      role="alert"
      className="w-full rounded-xl border border-[var(--danger-line)] bg-[var(--danger-tint)] p-3 text-left"
    >
      <p className="text-xs font-semibold text-[var(--ink)]">
        确定删除 {originalName}？
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
        只删除这个文件本身。已确认的职业事实和历史差异分析结果都会保留。
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
        {usageCopy(applicationCount, confirmedFactCount)}
      </p>
      {status === "extracting" ? (
        <p className="mt-1 text-xs font-semibold leading-5 text-[var(--danger)]">
          这个文件正在提取中，删除后本次提取会失败，已提取的内容不会保存。
        </p>
      ) : null}
      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
        原文件不能恢复，需要时请重新上传。
      </p>
      {error ? (
        <p className="mt-2 text-xs font-semibold text-[var(--danger)]">{error}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setExpanded(false);
          }}
          className="button-secondary px-3 py-2 text-xs font-medium disabled:opacity-60"
        >
          取消
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={submitDeletion}
          className="button-danger px-3 py-2 text-xs font-semibold disabled:opacity-60"
        >
          {pending ? "正在删除…" : "确认删除文件"}
        </button>
      </div>
    </div>
  );
}
