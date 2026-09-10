"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import type { Dictionary } from "@/i18n/dictionaries/en";

import type { ApplicationActionState } from "./actions";
import {
  APPLICATION_STAGES,
  type ApplicationStage,
} from "./schemas";

/** Server error codes to the sentence that explains each one. */
export function stageUpdateMessage(
  code: string,
  copy: Dictionary["applications"]["stageUpdate"],
): string {
  const messages: Record<string, string> = {
    "application-stage-unchanged": copy.errors.unchanged,
    "application-not-found": copy.errors.notFound,
    "invalid-input": copy.errors.invalidInput,
    "invalid-application-input": copy.errors.futureDate,
    "application-storage-error": copy.errors.storageError,
    "application-action-failed": copy.errors.storageError,
  };
  return messages[code] ?? copy.errors.storageError;
}

export function StageUpdateForm({
  applicationId,
  currentStage,
  changeStage,
  refresh,
  copy,
}: {
  applicationId: string;
  currentStage: ApplicationStage;
  changeStage(formData: FormData): Promise<ApplicationActionState>;
  refresh?: () => void;
  copy: Dictionary["applications"];
}) {
  const router = useRouter();
  const availableStages = APPLICATION_STAGES.filter(
    (stage) => stage !== currentStage,
  );
  const [stage, setStage] = useState<ApplicationStage>(availableStages[0]);
  const selectedStage = availableStages.includes(stage)
    ? stage
    : availableStages[0];
  const [occurredOn, setOccurredOn] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set("applicationId", applicationId);
    formData.set("stage", selectedStage);
    formData.set("occurredOn", occurredOn);
    formData.set("note", note);

    try {
      const result = await changeStage(formData);
      if (!("ok" in result) || !result.ok) {
        const code = "error" in result ? result.error : "application-action-failed";
        setError(stageUpdateMessage(code, copy.stageUpdate));
        return;
      }
      setSuccess(true);
      (refresh ?? router.refresh)();
    } catch {
      setError(copy.stageUpdate.errors.storageError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">
        {copy.stageUpdate.newStage}
        <select
          className="form-input mt-2"
          value={selectedStage}
          onChange={(event) => setStage(event.target.value as ApplicationStage)}
        >
          {availableStages.map((value) => (
            <option key={value} value={value}>
              {copy.stages[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-semibold">
        {copy.stageUpdate.occurredAt}
        <input
          type="date"
          className="form-input mt-2"
          value={occurredOn}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(event) => setOccurredOn(event.target.value)}
          required
        />
      </label>
      <label className="text-sm font-semibold sm:col-span-2">
        {copy.stageUpdate.note}
        <textarea
          className="form-input mt-2 min-h-24 resize-y"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={copy.stageUpdate.notePlaceholder}
          maxLength={2_000}
        />
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          className="button-primary min-h-11 px-5 text-sm font-semibold"
          disabled={busy}
        >
          {busy ? copy.stageUpdate.updating : copy.stageUpdate.submit}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-[var(--error)] sm:col-span-2">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm font-bold text-[var(--mint-strong)] sm:col-span-2">
          {copy.stageUpdate.done}
        </p>
      ) : null}
    </form>
  );
}
