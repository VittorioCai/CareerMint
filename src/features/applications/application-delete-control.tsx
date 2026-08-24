"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ApplicationActionState } from "./actions";

const DELETE_ERRORS: Record<string, string> = {
  "application-not-found": "记录不存在或已被删除。",
  "deletion-confirmation-required": "请先确认删除这条记录。",
  "invalid-input": "删除请求无效，请刷新页面后重试。",
  "application-storage-error": "暂时无法删除记录，请稍后重试。",
  "application-action-failed": "暂时无法删除记录，请稍后重试。",
};

export function ApplicationDeleteControl({
  applicationId,
  companyName,
  roleTitle,
  redirectAfterDelete = false,
  compact = false,
  deleteApplication,
}: {
  applicationId: string;
  companyName: string;
  roleTitle: string;
  redirectAfterDelete?: boolean;
  compact?: boolean;
  deleteApplication: (formData: FormData) => Promise<ApplicationActionState>;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [pending, startTransition] = useTransition();

  if (deleted) {
    return (
      <p role="status" className="text-xs font-bold text-[var(--ink-muted)]">
        记录已删除
      </p>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setExpanded(true);
        }}
        className={compact
          ? "text-xs font-black text-[#a83c34] underline underline-offset-4"
          : "button-secondary min-h-10 px-4 text-sm font-black text-[#a83c34]"}
      >
        删除记录
      </button>
    );
  }

  function submitDeletion() {
    setError(null);
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("confirmed", "true");
    if (redirectAfterDelete) formData.set("redirectAfterDelete", "true");

    startTransition(async () => {
      const result = await deleteApplication(formData);
      if ("ok" in result && result.ok) {
        setDeleted(true);
        router.refresh();
        return;
      }
      const code = "error" in result ? result.error : "application-action-failed";
      setError(DELETE_ERRORS[code] ?? DELETE_ERRORS["application-action-failed"]);
    });
  }

  return (
    <div
      role="alert"
      className="rounded-xl border border-[#d89a94] bg-[#fff4f2] p-3 text-left"
    >
      <p className="text-xs font-black text-[var(--ink)]">
        确定删除 {companyName} · {roleTitle}？
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
        将删除这条投递及其工作区历史；不会删除职业档案或已上传简历。
      </p>
      {error ? (
        <p className="mt-2 text-xs font-black text-[#a83c34]">{error}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            setExpanded(false);
          }}
          className="rounded-lg border border-[var(--ink)] bg-white px-3 py-2 text-xs font-black disabled:opacity-60"
        >
          取消
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={submitDeletion}
          className="rounded-lg border border-[var(--ink)] bg-[var(--coral)] px-3 py-2 text-xs font-black text-white disabled:opacity-60"
        >
          {pending ? "正在删除…" : "确认删除记录"}
        </button>
      </div>
    </div>
  );
}
