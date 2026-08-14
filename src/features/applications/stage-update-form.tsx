"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import type { ApplicationActionState } from "./actions";
import {
  APPLICATION_STAGES,
  APPLICATION_STAGE_LABELS,
  type ApplicationStage,
} from "./schemas";

const errorMessages: Record<string, string> = {
  "application-stage-unchanged": "当前已经是这个阶段，请选择其他阶段。",
  "application-not-found": "找不到这份申请，或你没有访问权限。",
  "invalid-input": "请检查阶段和发生日期。",
  "invalid-application-input": "发生日期不能晚于今天。",
  "application-storage-error": "暂时无法更新阶段，请稍后重试。",
  "application-action-failed": "暂时无法更新阶段，请稍后重试。",
};

export function StageUpdateForm({
  applicationId,
  currentStage,
  changeStage,
  refresh,
}: {
  applicationId: string;
  currentStage: ApplicationStage;
  changeStage(formData: FormData): Promise<ApplicationActionState>;
  refresh?: () => void;
}) {
  const router = useRouter();
  const availableStages = APPLICATION_STAGES.filter(
    (stage) => stage !== currentStage,
  );
  const [stage, setStage] = useState<ApplicationStage>(availableStages[0]);
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
    formData.set("stage", stage);
    formData.set("occurredOn", occurredOn);
    formData.set("note", note);

    try {
      const result = await changeStage(formData);
      if (!("ok" in result) || !result.ok) {
        const code = "error" in result ? result.error : "application-action-failed";
        setError(errorMessages[code] ?? errorMessages["application-action-failed"]);
        return;
      }
      setSuccess(true);
      (refresh ?? router.refresh)();
    } catch {
      setError(errorMessages["application-action-failed"]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-black">
        新阶段
        <select
          className="form-input mt-2"
          value={stage}
          onChange={(event) => setStage(event.target.value as ApplicationStage)}
        >
          {availableStages.map((value) => (
            <option key={value} value={value}>
              {APPLICATION_STAGE_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-black">
        发生日期
        <input
          type="date"
          className="form-input mt-2"
          value={occurredOn}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(event) => setOccurredOn(event.target.value)}
          required
        />
      </label>
      <label className="text-sm font-black sm:col-span-2">
        备注（可选）
        <textarea
          className="form-input mt-2 min-h-24 resize-y"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="例如：通过公司官网提交，等待 HR 回复"
          maxLength={2_000}
        />
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          className="button-primary min-h-11 px-5 text-sm font-black"
          disabled={busy}
        >
          {busy ? "正在更新…" : "确认更新阶段"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-[var(--error)] sm:col-span-2">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm font-bold text-[var(--mint-strong)] sm:col-span-2">
          阶段已更新，时间线已记录。
        </p>
      ) : null}
    </form>
  );
}
