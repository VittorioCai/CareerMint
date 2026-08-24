"use client";

import { useState } from "react";

import { FactFields } from "./fact-fields";
import {
  FactFormMappingError,
  factDataToFormValues,
  mapFactFormValues,
  type FactFormField,
} from "./fact-form-mapping";
import type { CareerFact, CareerFactInput } from "./schemas";

type ActionResult = Promise<{ ok: true } | { ok: false; error: string }>;

type FactEditorActions = {
  confirm(input: {
    factId: string;
    explicitConfirmation: boolean;
  }): ActionResult;
  markNeedsDetail(input: { factId: string }): ActionResult;
  update(input: CareerFactInput & { factId: string }): ActionResult;
  remove(input: { factId: string }): ActionResult;
};

const statusCopy = {
  pending: "待确认",
  confirmed: "已确认",
  needs_detail: "需要补充",
} as const;

export function FactEditor({
  fact,
  actions,
}: {
  fact: CareerFact;
  actions: FactEditorActions;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [explicit, setExplicit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(fact.confirmationStatus);
  const [data, setData] = useState(fact.data);
  const [formValues, setFormValues] = useState(() =>
    factDataToFormValues(fact.factType, fact.data),
  );
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FactFormField, string>>
  >({});

  async function run(action: () => ActionResult, after?: () => void) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError("操作没有保存，请稍后重试。");
      return;
    }
    after?.();
  }

  const chipClass =
    status === "confirmed"
      ? "status-mint"
      : status === "needs_detail"
        ? "bg-[var(--coral)] text-white"
        : "status-yellow";

  return (
    <article className="min-w-0 border-b border-[var(--line)] bg-white p-4 last:border-b-0 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`status-chip ${chipClass}`}>{statusCopy[status]}</span>
          <h3 className="heading-font mt-3 break-words text-lg font-black">
            {data.title}
          </h3>
          {data.organization ? (
            <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
              {data.organization}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="button-secondary min-h-10 px-3 text-xs font-black"
            onClick={() => setEditing((value) => !value)}
          >
            编辑事实
          </button>
          <button
            type="button"
            className="min-h-10 rounded-xl border border-[var(--line)] px-3 text-xs font-black text-[var(--error)]"
            disabled={busy}
            onClick={() =>
              void run(() => actions.remove({ factId: fact.id }))
            }
          >
            删除事实
          </button>
        </div>
      </div>

      {!editing ? (
        <div className="mt-4 space-y-3">
          <p className="whitespace-pre-wrap text-sm font-medium leading-6">
            {data.description}
          </p>
          {data.startDate || data.endDate ? (
            <p className="text-xs font-bold text-[var(--ink-muted)]">
              {data.startDate ?? "未填写"} — {data.endDate ?? "至今"}
            </p>
          ) : null}
          {data.skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {data.skills.map((skill) => (
                <span key={skill} className="rounded-full bg-[var(--mist-blue)] px-2.5 py-1 text-xs font-black">
                  {skill}
                </span>
              ))}
            </div>
          ) : null}
          {fact.sourceExcerpt ? (
            <details className="rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3">
              <summary className="cursor-pointer text-xs font-black">查看原始证据</summary>
              <p className="mt-2 whitespace-pre-wrap break-words text-xs font-medium leading-5 text-[var(--ink-muted)]">
                {fact.sourceExcerpt}
              </p>
            </details>
          ) : (
            <p className="text-xs font-bold text-[var(--ink-muted)]">手动添加 · 无原始文件证据</p>
          )}
        </div>
      ) : (
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            let input: CareerFactInput;
            try {
              input = mapFactFormValues(fact.factType, formValues);
              setFieldErrors({});
            } catch (mappingError) {
              if (mappingError instanceof FactFormMappingError) {
                setFieldErrors({ [mappingError.field]: mappingError.message });
              } else {
                setError("内容没有保存，请检查必填项和日期格式。");
              }
              return;
            }
            void run(
              () =>
                actions.update({
                  factId: fact.id,
                  ...input,
                }),
              () => {
                setData(input.data);
                setFormValues(factDataToFormValues(fact.factType, input.data));
                setStatus("pending");
                setEditing(false);
              },
            );
          }}
        >
          <FactFields
            factType={fact.factType}
            values={formValues}
            errors={fieldErrors}
            idPrefix={`fact-${fact.id}`}
            onChange={(field, value) => {
              setFormValues((current) => ({ ...current, [field]: value }));
              setFieldErrors((current) => ({ ...current, [field]: undefined }));
            }}
          />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className="button-primary min-h-10 px-4 text-sm font-black" disabled={busy}>
              {busy ? "保存中…" : "保存修改"}
            </button>
            <button
              type="button"
              className="button-secondary min-h-10 px-4 text-sm font-black"
              onClick={() => {
                setFormValues(factDataToFormValues(fact.factType, data));
                setFieldErrors({});
                setEditing(false);
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}

      {status !== "confirmed" ? (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
          <button
            type="button"
            className="button-primary min-h-10 px-4 text-sm font-black"
            disabled={busy}
            onClick={() => {
              setExplicit(false);
              setConfirming(true);
            }}
          >
            确认真实
          </button>
          <button
            type="button"
            className="button-secondary min-h-10 px-4 text-sm font-black"
            disabled={busy}
            onClick={() =>
              void run(
                () => actions.markNeedsDetail({ factId: fact.id }),
                () => setStatus("needs_detail"),
              )
            }
          >
            需要补充
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm font-bold text-[var(--error)]">
          {error}
        </p>
      ) : null}

      {confirming ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[color:var(--ink)]/35 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="确认职业事实"
            className="sticker-border w-full max-w-xl bg-white p-5 shadow-[6px_6px_0_var(--ink)] sm:p-7"
          >
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">最后核对</p>
            <h2 className="heading-font mt-2 text-2xl font-black">确认职业事实</h2>
            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4">
              <p className="font-black">{data.title}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{data.description}</p>
            </div>
            <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm font-bold leading-6">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--mint-strong)]"
                checked={explicit}
                onChange={(event) => setExplicit(event.target.checked)}
              />
              <span>我确认这条内容真实、准确，并同意用于后续求职材料</span>
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="button-secondary min-h-10 px-4 text-sm font-black" onClick={() => setConfirming(false)}>
                返回检查
              </button>
              <button
                type="button"
                className="button-primary min-h-10 px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!explicit || busy}
                onClick={() =>
                  void run(
                    () =>
                      actions.confirm({
                        factId: fact.id,
                        explicitConfirmation: explicit,
                      }),
                    () => {
                      setStatus("confirmed");
                      setConfirming(false);
                    },
                  )
                }
              >
                确认并保存
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </article>
  );
}
