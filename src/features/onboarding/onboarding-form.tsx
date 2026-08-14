"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import type { AccountPreferences } from "@/features/account/schemas";
import { UploadForm } from "@/features/source-assets/upload-form";

type ActionResult = Promise<{ ok: true } | { ok: false; error: string }>;

export function OnboardingForm({
  initialPreferences,
  factCount,
  savePreferences,
  completeOnboarding,
}: {
  initialPreferences: AccountPreferences;
  factCount: number;
  savePreferences(input: unknown): ActionResult;
  completeOnboarding(): ActionResult;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [countries, setCountries] = useState(
    initialPreferences.targetCountries.join(", "),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);

  function payload(): AccountPreferences {
    return {
      ...preferences,
      targetCountries: countries
        .split(",")
        .map((country) => country.trim())
        .filter(Boolean),
    };
  }

  async function saveGoals(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    const result = await savePreferences(payload());
    setBusy(false);
    if (!result.ok) {
      setError("请检查必填信息和时区后再保存。");
      return false;
    }
    setStep(2);
    return true;
  }

  async function saveBeforeExtraction() {
    const result = await savePreferences(payload());
    if (!result.ok) throw new Error("account-preferences-save-failed");
  }

  async function finish() {
    setBusy(true);
    setError(null);
    const result = await completeOnboarding();
    setBusy(false);
    if (!result.ok) setError("暂时无法进入工作台，请稍后重试。");
  }

  const steps = [
    { number: 1, label: "求职目标" },
    { number: 2, label: "上传简历" },
    { number: 3, label: "核对事实" },
  ] as const;

  return (
    <div className="min-w-0">
      <ol className="grid gap-3 sm:grid-cols-3" aria-label="建档步骤">
        {steps.map((item) => (
          <li
            key={item.number}
            className={`rounded-2xl border-2 border-[var(--ink)] p-4 ${
              step === item.number
                ? "bg-[var(--cream)] shadow-[3px_3px_0_var(--ink)]"
                : step > item.number
                  ? "bg-[var(--mint)]"
                  : "bg-white"
            }`}
          >
            <span className="text-xs font-black text-[var(--ink-muted)]">
              STEP {item.number}
            </span>
            <h2 className="heading-font mt-1 text-lg font-black">{item.label}</h2>
          </li>
        ))}
      </ol>

      <div className="mt-6 min-w-0 rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-7">
        {step === 1 ? (
          <form className="grid min-w-0 gap-5 sm:grid-cols-2" onSubmit={saveGoals}>
            <div className="sm:col-span-2">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">01 · 先确定方向</p>
              <h3 className="heading-font mt-2 text-2xl font-black">让后续建议围绕你的真实目标</h3>
            </div>
            <label className="block text-sm font-black">
              姓名
              <input className="form-input mt-2" value={preferences.displayName} onChange={(event) => setPreferences((current) => ({ ...current, displayName: event.target.value }))} required />
            </label>
            <label className="block text-sm font-black">
              目标岗位
              <input className="form-input mt-2" value={preferences.targetRole} onChange={(event) => setPreferences((current) => ({ ...current, targetRole: event.target.value }))} placeholder="例如 Product Analyst" required />
            </label>
            <label className="block text-sm font-black sm:col-span-2">
              目标国家
              <input className="form-input mt-2" value={countries} onChange={(event) => setCountries(event.target.value)} placeholder="Germany, Netherlands（可留空）" />
            </label>
            <label className="block text-sm font-black">
              求职语言
              <select className="form-input mt-2" value={preferences.jobSearchLanguage} onChange={() => undefined}>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block text-sm font-black">
              界面语言
              <select className="form-input mt-2" value={preferences.interfaceLocale} onChange={(event) => setPreferences((current) => ({ ...current, interfaceLocale: event.target.value as "zh-CN" | "en" }))}>
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block text-sm font-black sm:col-span-2">
              时区（IANA）
              <input className="form-input mt-2" value={preferences.timezone} onChange={(event) => setPreferences((current) => ({ ...current, timezone: event.target.value }))} placeholder="Europe/Berlin" required />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="button-primary min-h-11 px-5 text-sm font-black" disabled={busy}>
                {busy ? "保存中…" : "保存求职目标"}
              </button>
            </div>
          </form>
        ) : null}

        {step === 2 ? (
          <section className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">02 · 从已有材料开始</p>
            <h3 className="heading-font mt-2 text-2xl font-black">上传简历，减少重复填写</h3>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4 text-sm font-bold leading-6">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-[var(--mint-strong)]"
                checked={preferences.aiProcessingAllowed}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    aiProcessingAllowed: event.target.checked,
                  }))
                }
              />
              <span>
                允许系统将提取后的简历文字发送给 AI 服务进行分析
                <span className="mt-1 block text-xs font-medium text-[var(--ink-muted)]">
                  只发送文字，不发送原文件；任何事实都需要你确认。
                </span>
              </span>
            </label>
            <Link href="/settings/privacy" className="mt-2 inline-flex text-xs font-black underline underline-offset-4">
              查看 AI 与数据说明
            </Link>
            <div className="mt-5 min-w-0">
              <UploadForm
                onUploaded={() => setUploaded(true)}
                beforeExtract={saveBeforeExtraction}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" className="button-primary min-h-11 px-5 text-sm font-black" onClick={() => setStep(3)}>
                {uploaded ? "继续核对事实" : "暂时跳过"}
              </button>
              {uploaded ? (
                <button type="button" className="button-secondary min-h-11 px-5 text-sm font-black" onClick={() => setStep(3)}>
                  稍后核对
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">03 · 你拥有最后决定权</p>
            <h3 className="heading-font mt-2 text-2xl font-black">AI 结果仍然是未确认草稿</h3>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-[var(--ink-muted)]">
              系统不会因为你完成引导就自动确认任何经历、数字或技能。请在职业档案中逐条核对。
            </p>
            {factCount > 0 || uploaded ? (
              <Link href="/profile" className="button-secondary mt-5 inline-flex min-h-11 items-center px-5 text-sm font-black">
                前往核对职业档案
              </Link>
            ) : (
              <p className="mt-5 rounded-xl bg-[var(--mist-blue)] p-4 text-sm font-bold">
                你暂时没有待核对事实，可以先进入工作台，之后随时手动添加。
              </p>
            )}
            <div className="mt-6 border-t border-[var(--line)] pt-5">
              <button type="button" className="button-primary min-h-12 px-6 text-sm font-black" disabled={busy} onClick={() => void finish()}>
                {busy ? "正在进入…" : "进入工作台"}
              </button>
            </div>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="mt-5 text-sm font-bold text-[var(--error)]">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
