"use client";

import { type FormEvent, useState } from "react";

import {
  FactFormMappingError,
  mapFactFormValues,
  type FactFormField,
  type FactFormValues,
  type FactType,
} from "./fact-form-mapping";
import { FactFields, pruneFactFormValues } from "./fact-fields";
import type { CareerFactInput } from "./schemas";

type ActionResult = Promise<{ ok: true } | { ok: false; error: string }>;

export function ManualFactForm({
  createFact,
}: {
  createFact(input: CareerFactInput): ActionResult;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [factType, setFactType] = useState<FactType>("skill");
  const [values, setValues] = useState<FactFormValues>({});
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FactFormField, string>>
  >({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let input: CareerFactInput;
    try {
      input = mapFactFormValues(factType, values);
    } catch (mappingError) {
      if (mappingError instanceof FactFormMappingError) {
        setFieldErrors({ [mappingError.field]: mappingError.message });
        return;
      }
      setError("内容没有保存，请检查必填项和日期格式。");
      return;
    }
    setBusy(true);
    setError(null);
    setErrorCode(null);
    setFieldErrors({});
    const result = await createFact(input);
    setBusy(false);
    if (result.ok) setOpen(false);
    else {
      setErrorCode(result.error);
      setError(
        result.error === "invalid-input"
          ? "内容没有保存，请检查必填项和日期格式。"
          : "暂时无法保存这条事实，请稍后重试。",
      );
    }
  }

  if (!open) {
    return (
      <button type="button" className="button-primary min-h-11 px-5 text-sm font-black" onClick={() => setOpen(true)}>
        ＋ 手动添加事实
      </button>
    );
  }

  return (
    <form className="dense-surface mt-4 grid gap-4 p-5 sm:grid-cols-2" noValidate onSubmit={submit}>
      <div className="sm:col-span-2">
        <h2 className="heading-font text-xl font-black">新增职业事实</h2>
        <p className="mt-1 text-xs font-medium text-[var(--ink-muted)]">手动事实也从“待确认”开始。</p>
      </div>
      <label className="block text-sm font-black">
        类型
        <select
          name="factType"
          className="form-input mt-2"
          value={factType}
          onChange={(event) => {
            const next = event.target.value as FactType;
            setFactType(next);
            setValues((current) => pruneFactFormValues(next, current));
            setFieldErrors({});
            setError(null);
          }}
        >
          <option value="summary">个人总结</option>
          <option value="work_experience">工作经历</option>
          <option value="education">教育</option>
          <option value="project">项目</option>
          <option value="skill">技能</option>
          <option value="certification">证书</option>
          <option value="language">语言</option>
          <option value="achievement">量化成果</option>
          <option value="story">STAR 故事</option>
        </select>
      </label>
      <FactFields
        factType={factType}
        values={values}
        errors={fieldErrors}
        idPrefix="new-fact"
        onChange={(field, value) => {
          setValues((current) => ({ ...current, [field]: value }));
          setFieldErrors((current) => ({ ...current, [field]: undefined }));
        }}
      />
      {error ? <p role="alert" data-error-code={errorCode ?? undefined} className="text-sm font-bold text-[var(--error)] sm:col-span-2">{error}</p> : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" className="button-primary min-h-10 px-4 text-sm font-black" disabled={busy}>{busy ? "保存中…" : "保存为待确认"}</button>
        <button
          type="button"
          className="button-secondary min-h-10 px-4 text-sm font-black"
          onClick={() => {
            setOpen(false);
            setError(null);
            setFieldErrors({});
          }}
        >
          取消
        </button>
      </div>
    </form>
  );
}
