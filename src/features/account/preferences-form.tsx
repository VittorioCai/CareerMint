"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import type { AccountPreferences } from "./schemas";

type ActionResult = Promise<{ ok: true } | { ok: false; error: string }>;

export function AccountPreferencesForm({
  email,
  initialPreferences,
  savePreferences,
}: {
  email: string;
  initialPreferences: AccountPreferences;
  savePreferences(input: unknown): ActionResult;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [countries, setCountries] = useState(
    initialPreferences.targetCountries.join(", "),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    const result = await savePreferences({
      ...preferences,
      targetCountries: countries
        .split(",")
        .map((country) => country.trim())
        .filter(Boolean),
    });
    setBusy(false);
    if (result.ok) setMessage("账户偏好已保存");
    else setError("保存失败，请检查输入后重试。");
  }

  return (
    <form className="dense-surface grid min-w-0 gap-5 p-5 sm:grid-cols-2 sm:p-7" onSubmit={submit}>
      <label className="block text-sm font-black sm:col-span-2">
        登录邮箱（已验证）
        <input className="form-input mt-2 bg-[var(--canvas)]" value={email} readOnly aria-readonly="true" />
      </label>
      <label className="block text-sm font-black">
        姓名
        <input className="form-input mt-2" value={preferences.displayName} onChange={(event) => setPreferences((current) => ({ ...current, displayName: event.target.value }))} required />
      </label>
      <label className="block text-sm font-black">
        目标岗位
        <input className="form-input mt-2" value={preferences.targetRole} onChange={(event) => setPreferences((current) => ({ ...current, targetRole: event.target.value }))} required />
      </label>
      <label className="block text-sm font-black sm:col-span-2">
        目标国家（逗号分隔）
        <input className="form-input mt-2" value={countries} onChange={(event) => setCountries(event.target.value)} />
      </label>
      <label className="block text-sm font-black">
        界面语言
        <select className="form-input mt-2" value={preferences.interfaceLocale} onChange={(event) => setPreferences((current) => ({ ...current, interfaceLocale: event.target.value as "zh-CN" | "en" }))}>
          <option value="zh-CN">简体中文</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="block text-sm font-black">
        时区
        <input className="form-input mt-2" value={preferences.timezone} onChange={(event) => setPreferences((current) => ({ ...current, timezone: event.target.value }))} required />
      </label>
      <fieldset className="rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4 sm:col-span-2">
        <legend className="px-1 text-sm font-black">AI 数据授权</legend>
        <label className="flex cursor-pointer items-start gap-3 text-sm font-bold leading-6">
          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--mint-strong)]" checked={preferences.aiProcessingAllowed} onChange={(event) => setPreferences((current) => ({ ...current, aiProcessingAllowed: event.target.checked }))} />
          <span>
            允许将本地提取后的简历文字发送给 DeepSeek 进行分析
            <span className="mt-1 block text-xs font-medium text-[var(--ink-muted)]">
              关闭后，未来的 AI 分析立即停止；已确认资料仍保留，直到你自行删除。
            </span>
          </span>
        </label>
      </fieldset>
      {message ? <p role="status" className="text-sm font-black text-[var(--mint-strong)] sm:col-span-2">{message}</p> : null}
      {error ? <p role="alert" className="text-sm font-black text-[var(--error)] sm:col-span-2">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className="button-primary min-h-11 px-5 text-sm font-black" disabled={busy}>
          {busy ? "保存中…" : "保存设置"}
        </button>
        <Link href="/forgot-password" className="text-sm font-black underline underline-offset-4">修改密码</Link>
        <Link href="/settings/privacy" className="text-sm font-black underline underline-offset-4">数据导出与删除</Link>
      </div>
    </form>
  );
}
