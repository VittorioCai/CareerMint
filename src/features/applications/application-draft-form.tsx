"use client";

import { type FormEvent, useEffect, useState } from "react";

import type { ApplicationActionState } from "./actions";
import { WORKPLACE_MODE_LABELS, type WorkplaceMode } from "./schemas";

const STORAGE_KEY = "careermint:new-application-draft:v1";

type DraftValues = {
  companyName: string;
  roleTitle: string;
  location: string;
  workplaceMode: WorkplaceMode;
  source: string;
  jobUrl: string;
  jdText: string;
};

const emptyDraft: DraftValues = {
  companyName: "",
  roleTitle: "",
  location: "",
  workplaceMode: "unspecified",
  source: "",
  jobUrl: "",
  jdText: "",
};

const actionErrorMessages: Record<string, string> = {
  "invalid-input": "请检查必填信息、岗位链接和 JD 长度。",
  "invalid-application-input": "部分岗位信息不符合保存要求，请检查后重试。",
  "application-storage-error": "暂时无法建立申请工作区，草稿仍保存在当前浏览器。",
  "application-action-failed": "暂时无法建立申请工作区，草稿仍保存在当前浏览器。",
};

function recoverDraft(raw: string | null): DraftValues | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<DraftValues>;
    if (!value || typeof value !== "object") return null;
    return {
      companyName:
        typeof value.companyName === "string" ? value.companyName : "",
      roleTitle: typeof value.roleTitle === "string" ? value.roleTitle : "",
      location: typeof value.location === "string" ? value.location : "",
      workplaceMode: ["unspecified", "onsite", "hybrid", "remote"].includes(
        value.workplaceMode ?? "",
      )
        ? (value.workplaceMode as WorkplaceMode)
        : "unspecified",
      source: typeof value.source === "string" ? value.source : "",
      jobUrl: typeof value.jobUrl === "string" ? value.jobUrl : "",
      jdText: typeof value.jdText === "string" ? value.jdText : "",
    };
  } catch {
    return null;
  }
}

export function ApplicationDraftForm({
  createApplication,
  navigate = (href) => window.location.assign(href),
}: {
  createApplication(formData: FormData): Promise<ApplicationActionState>;
  navigate?: (href: string) => void;
}) {
  const [draft, setDraft] = useState<DraftValues>(emptyDraft);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const recovered = recoverDraft(window.localStorage.getItem(STORAGE_KEY));
      if (recovered) setDraft(recovered);
      setHydrated(true);
    });
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [draft, hydrated]);

  function setField<Key extends keyof DraftValues>(
    field: Key,
    value: DraftValues[Key],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const formData = new FormData();
    for (const [key, value] of Object.entries(draft)) {
      formData.set(key, value);
    }

    const result = await createApplication(formData);
    setBusy(false);
    if (!("ok" in result) || !result.ok) {
      const code = "error" in result ? result.error : "application-action-failed";
      setError(actionErrorMessages[code] ?? actionErrorMessages["application-action-failed"]);
      return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
    navigate(`/applications/${result.applicationId}?tab=resume&setup=1`);
  }

  return (
    <form onSubmit={submit} className="min-w-0">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-black">
          公司
          <input
            name="companyName"
            className="form-input mt-2"
            value={draft.companyName}
            onChange={(event) => setField("companyName", event.target.value)}
            placeholder="例如 Acme GmbH"
            autoComplete="organization"
            maxLength={160}
            required
          />
        </label>

        <label className="block text-sm font-black">
          职位
          <input
            name="roleTitle"
            className="form-input mt-2"
            value={draft.roleTitle}
            onChange={(event) => setField("roleTitle", event.target.value)}
            placeholder="例如 Product Manager"
            maxLength={160}
            required
          />
        </label>

        <label className="block text-sm font-black">
          地点
          <input
            name="location"
            className="form-input mt-2"
            value={draft.location}
            onChange={(event) => setField("location", event.target.value)}
            placeholder="Berlin, Germany"
            maxLength={240}
          />
        </label>

        <label className="block text-sm font-black">
          办公方式
          <select
            name="workplaceMode"
            className="form-input mt-2"
            value={draft.workplaceMode}
            onChange={(event) =>
              setField("workplaceMode", event.target.value as WorkplaceMode)
            }
          >
            {Object.entries(WORKPLACE_MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-black">
          来源
          <input
            name="source"
            className="form-input mt-2"
            value={draft.source}
            onChange={(event) => setField("source", event.target.value)}
            placeholder="公司官网、LinkedIn、内推…"
            maxLength={120}
          />
        </label>

        <label className="block text-sm font-black">
          岗位链接
          <input
            name="jobUrl"
            type="url"
            className="form-input mt-2"
            value={draft.jobUrl}
            onChange={(event) => setField("jobUrl", event.target.value)}
            placeholder="https://…"
            maxLength={2048}
          />
        </label>
      </div>

      <div className="mt-5">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="application-jd-text" className="text-sm font-black">
            JD 原文
          </label>
          <span className="text-xs font-semibold text-[var(--ink-muted)]">
            {draft.jdText.length.toLocaleString()} / 100,000
          </span>
        </span>
        <textarea
          id="application-jd-text"
          name="jdText"
          className="form-input mt-2 min-h-72 resize-y leading-6"
          value={draft.jdText}
          onChange={(event) => setField("jdText", event.target.value)}
          placeholder="粘贴完整岗位描述。当前步骤只保存原文，不会自动调用 AI。"
          minLength={40}
          maxLength={100_000}
          required
        />
      </div>

      <div className="mt-5 flex flex-col gap-4 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="text-xs font-bold text-[var(--ink-muted)]">
          {hydrated ? "草稿已保存在当前浏览器" : "正在恢复本地草稿…"}
          <span className="mt-1 block font-medium">
            只有点击建立工作区后，内容才会同步到你的私有账户。
          </span>
        </div>
        <button
          type="submit"
          className="button-primary min-h-12 shrink-0 px-6 text-sm font-black"
          disabled={busy}
        >
          {busy ? "正在建立…" : "建立申请工作区"}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-5 rounded-xl border border-[var(--error)] bg-[#fff0ee] p-3 text-sm font-bold text-[var(--error)]"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
