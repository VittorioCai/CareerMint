"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import type { AccountPreferences } from "@/features/account/schemas";
import { UploadForm } from "@/features/source-assets/upload-form";
import type { Dictionary } from "@/i18n/dictionaries/en";

type ActionResult = Promise<{ ok: true } | { ok: false; error: string }>;

export function OnboardingForm({
  initialPreferences,
  factCount,
  savePreferences,
  completeOnboarding,
  copy,
}: {
  initialPreferences: AccountPreferences;
  factCount: number;
  savePreferences(input: unknown): ActionResult;
  completeOnboarding(): ActionResult;
  copy: Dictionary["onboarding"];
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
      setError(copy.saveFailed);
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
    if (!result.ok) setError(copy.enterFailed);
  }

  const steps = [
    { number: 1, label: copy.steps.goals },
    { number: 2, label: copy.steps.resume },
    { number: 3, label: copy.steps.facts },
  ] as const;

  return (
    <div className="min-w-0">
      <ol className="grid gap-3 sm:grid-cols-3" aria-label={copy.stepsLabel}>
        {steps.map((item) => (
          <li
            key={item.number}
            className={`rounded-2xl border p-4 ${
              step === item.number
                ? "border-[var(--line)] bg-[var(--paper)] shadow-[var(--elevation-1)]"
                : step > item.number
                  ? "border-transparent bg-[var(--sev-matched)]"
                  : "border-transparent bg-[var(--surface-muted)]"
            }`}
          >
            <span className="text-xs font-semibold text-[var(--ink-muted)]">
              STEP {item.number}
            </span>
            <h2 className="heading-font mt-1 text-lg font-semibold">{item.label}</h2>
          </li>
        ))}
      </ol>

      <div className="mt-6 min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4 sm:p-7">
        {step === 1 ? (
          <form className="grid min-w-0 gap-5 sm:grid-cols-2" onSubmit={saveGoals}>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">{copy.goalsEyebrow}</p>
              <h3 className="heading-font mt-2 text-2xl font-bold">{copy.goalsTitle}</h3>
            </div>
            <label className="block text-sm font-semibold">
              {copy.displayName}
              <input className="form-input mt-2" value={preferences.displayName} onChange={(event) => setPreferences((current) => ({ ...current, displayName: event.target.value }))} required />
            </label>
            <label className="block text-sm font-semibold">
              {copy.targetRole}
              <input className="form-input mt-2" value={preferences.targetRole} onChange={(event) => setPreferences((current) => ({ ...current, targetRole: event.target.value }))} placeholder={copy.targetRolePlaceholder} required />
            </label>
            <label className="block text-sm font-semibold sm:col-span-2">
              {copy.targetCountries}
              <input className="form-input mt-2" value={countries} onChange={(event) => setCountries(event.target.value)} placeholder={copy.targetCountriesPlaceholder} />
            </label>
            <label className="block text-sm font-semibold">
              {copy.jobSearchLanguage}
              <select className="form-input mt-2" value={preferences.jobSearchLanguage} onChange={() => undefined}>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              {copy.interfaceLanguage}
              <select className="form-input mt-2" value={preferences.interfaceLocale} onChange={(event) => setPreferences((current) => ({ ...current, interfaceLocale: event.target.value as "zh-CN" | "en" }))}>
                <option value="zh-CN">中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block text-sm font-semibold sm:col-span-2">
              {copy.timezone}
              <input className="form-input mt-2" value={preferences.timezone} onChange={(event) => setPreferences((current) => ({ ...current, timezone: event.target.value }))} placeholder="Europe/Berlin" required />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="button-primary min-h-11 px-5 text-sm font-semibold" disabled={busy}>
                {busy ? copy.saving : copy.saveGoals}
              </button>
            </div>
          </form>
        ) : null}

        {step === 2 ? (
          <section className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">{copy.resumeEyebrow}</p>
            <h3 className="heading-font mt-2 text-2xl font-bold">{copy.resumeTitle}</h3>
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
                {copy.aiConsent}
                <span className="mt-1 block text-xs font-medium text-[var(--ink-muted)]">
                  {copy.aiConsentNote}
                </span>
              </span>
            </label>
            <Link href="/settings/privacy" className="mt-2 inline-flex text-xs font-semibold underline underline-offset-4">
              {copy.privacyLink}
            </Link>
            <div className="mt-5 min-w-0">
              <UploadForm
                onUploaded={() => setUploaded(true)}
                beforeExtract={saveBeforeExtraction}
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" className="button-primary min-h-11 px-5 text-sm font-semibold" onClick={() => setStep(3)}>
                {uploaded ? copy.continueToFacts : copy.skipForNow}
              </button>
              {uploaded ? (
                <button type="button" className="button-secondary min-h-11 px-5 text-sm font-semibold" onClick={() => setStep(3)}>
                  {copy.checkLater}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">{copy.factsEyebrow}</p>
            <h3 className="heading-font mt-2 text-2xl font-bold">{copy.factsTitle}</h3>
            <p className="mt-3 max-w-2xl type-caption font-medium text-[var(--ink-muted)]">
              {copy.factsBody}
            </p>
            {factCount > 0 || uploaded ? (
              <Link href="/profile" className="button-secondary mt-5 inline-flex min-h-11 items-center px-5 text-sm font-semibold">
                {copy.goToProfile}
              </Link>
            ) : (
              <p className="mt-5 rounded-xl bg-[var(--sev-minor)] p-4 text-sm font-bold">
                {copy.nothingToCheck}
              </p>
            )}
            <div className="mt-6 border-t border-[var(--line)] pt-5">
              <button type="button" className="button-primary min-h-12 px-6 text-sm font-semibold" disabled={busy} onClick={() => void finish()}>
                {busy ? copy.entering : copy.enterWorkspace}
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
