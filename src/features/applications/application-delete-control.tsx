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
        // Destructive, but not the most prominent thing on a card about a job
        // you are applying for. It stays muted until you reach for it.
        className={compact
          // --ink-soft on white is 2.71:1, below the 4.5:1 floor. Muted is
          // 5.94:1 and still reads as secondary next to the role title.
          ? "text-xs font-medium text-[var(--ink-muted)] underline decoration-transparent underline-offset-4 transition-colors duration-[var(--dur-fast)] hover:text-[var(--danger)] hover:decoration-current focus-visible:text-[var(--danger)]"
          : "press inline-flex min-h-10 items-center rounded-[10px] border border-[var(--line)] px-4 text-sm font-medium text-[var(--ink-muted)] hover:border-[var(--danger-line)] hover:text-[var(--danger)]"}
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
      className="rounded-xl border border-[var(--danger-line)] bg-[var(--danger-tint)] p-3 text-left"
    >
      <p className="text-xs font-black text-[var(--ink)]">
        确定删除 {companyName} · {roleTitle}？
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
        将删除这条投递及其工作区历史；不会删除职业档案或已上传简历。
      </p>
      {error ? (
        <p className="mt-2 text-xs font-black text-[var(--danger)]">{error}</p>
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
          {pending ? "正在删除…" : "确认删除记录"}
        </button>
      </div>
    </div>
  );
}
