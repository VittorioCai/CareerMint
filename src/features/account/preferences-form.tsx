"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import type { Dictionary } from "@/i18n/dictionaries/en";
import { APP_LOCALES, LOCALE_LABEL } from "@/i18n/locale";

import type { AccountPreferences } from "./schemas";

type ActionResult = Promise<{ ok: true } | { ok: false; error: string }>;

export function AccountPreferencesForm({
  email,
  initialPreferences,
  savePreferences,
  copy,
}: {
  email: string;
  initialPreferences: AccountPreferences;
  savePreferences(input: unknown): ActionResult;
  copy: Dictionary["settings"];
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
    if (result.ok) setMessage(copy.saved);
    else setError(copy.saveFailed);
  }

  return (
    <form className="dense-surface grid min-w-0 gap-5 p-5 sm:grid-cols-2 sm:p-7" onSubmit={submit}>
      <label className="block text-sm font-semibold sm:col-span-2">
        {copy.loginEmail}
        <input className="form-input mt-2 bg-[var(--canvas)]" value={email} readOnly aria-readonly="true" />
      </label>
      <label className="block text-sm font-semibold">
        {copy.name}
        <input className="form-input mt-2" value={preferences.displayName} onChange={(event) => setPreferences((current) => ({ ...current, displayName: event.target.value }))} required />
      </label>
      <label className="block text-sm font-semibold">
        {copy.targetRole}
        <input className="form-input mt-2" value={preferences.targetRole} onChange={(event) => setPreferences((current) => ({ ...current, targetRole: event.target.value }))} required />
      </label>
      <label className="block text-sm font-semibold sm:col-span-2">
        {copy.targetCountries}
        <input className="form-input mt-2" value={countries} onChange={(event) => setCountries(event.target.value)} />
      </label>
      <label className="block text-sm font-semibold">
        {copy.interfaceLanguage}
        {/* Each language names itself, from the same map the header switch
            uses: a reader looking for their own language finds it by
            recognising the word, and "Chinese" is no help to someone who
            cannot read the page it is written on. */}
        <select className="form-input mt-2" value={preferences.interfaceLocale} onChange={(event) => setPreferences((current) => ({ ...current, interfaceLocale: event.target.value as "zh-CN" | "en" }))}>
          {APP_LOCALES.map((locale) => (
            <option key={locale} value={locale} lang={locale}>
              {LOCALE_LABEL[locale]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        {copy.timezone}
        <input className="form-input mt-2" value={preferences.timezone} onChange={(event) => setPreferences((current) => ({ ...current, timezone: event.target.value }))} required />
      </label>
      <fieldset className="rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4 sm:col-span-2">
        <legend className="px-1 text-sm font-semibold">{copy.aiLegend}</legend>
        <label className="flex cursor-pointer items-start gap-3 text-sm font-bold leading-6">
          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--mint-strong)]" checked={preferences.aiProcessingAllowed} onChange={(event) => setPreferences((current) => ({ ...current, aiProcessingAllowed: event.target.checked }))} />
          <span>
            {copy.aiLabel}
            <span className="mt-1 block text-xs font-medium text-[var(--ink-muted)]">
              {copy.aiNote}
            </span>
          </span>
        </label>
      </fieldset>
      {message ? <p role="status" className="text-sm font-semibold text-[var(--mint-strong)] sm:col-span-2">{message}</p> : null}
      {error ? <p role="alert" className="text-sm font-semibold text-[var(--error)] sm:col-span-2">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className="button-primary min-h-11 px-5 text-sm font-semibold" disabled={busy}>
          {busy ? copy.saving : copy.save}
        </button>
        <Link href="/forgot-password" className="text-action text-sm font-semibold underline underline-offset-4">{copy.changePassword}</Link>
        <Link href="/settings/privacy" className="text-action text-sm font-semibold underline underline-offset-4">{copy.dataExportAndDelete}</Link>
      </div>
    </form>
  );
}
