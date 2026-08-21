"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import type { Application } from "@/features/applications/schemas";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";

import type { InterviewActionState } from "./actions";
import {
  INTERVIEW_CATEGORY_LABELS,
  INTERVIEW_PREPARATION_STATUSES,
  INTERVIEW_STATUS_LABELS,
  type InterviewPreparationStatus,
  type InterviewQuestion,
  type InterviewQuestionCategory,
} from "./schemas";

type BoundAction = (formData: FormData) => Promise<InterviewActionState>;

const errorMessages: Record<string, string> = {
  "invalid-input": "请检查填写内容和关联岗位。",
  "invalid-interview-operation": "这项修改不符合题库规则。",
  "interview-resource-not-found": "找不到这道题，或你没有访问权限。",
  "interview-storage-error": "暂时无法保存，请稍后重试。",
  "interview-action-failed": "暂时无法保存，请稍后重试。",
};

function resultError(result: InterviewActionState) {
  if ("ok" in result && !result.ok) {
    return errorMessages[result.error] ?? errorMessages["interview-action-failed"];
  }
  return null;
}

export function NewInterviewQuestionForm({
  applications,
  fixedApplicationId = null,
  addQuestion,
  refresh,
}: {
  applications: Array<Pick<Application, "id" | "companyName" | "roleTitle">>;
  fixedApplicationId?: string | null;
  addQuestion: BoundAction;
  refresh?: () => void;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState<InterviewQuestionCategory>(
    fixedApplicationId ? "job_specific" : "common",
  );
  const [applicationId, setApplicationId] = useState(
    fixedApplicationId ?? "",
  );
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
    formData.set("prompt", prompt);
    formData.set("category", category);
    formData.set("applicationId", fixedApplicationId ?? applicationId);
    try {
      const result = await addQuestion(formData);
      const message = resultError(result);
      if (message) {
        setError(message);
        return;
      }
      setPrompt("");
      setSuccess(true);
      (refresh ?? router.refresh)();
    } catch {
      setError(errorMessages["interview-action-failed"]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--cream)] p-5 shadow-[3px_3px_0_var(--ink)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em]">
            Add one question
          </p>
          <h2 className="heading-font mt-1 text-xl font-black">手动加入题库</h2>
        </div>
        <span className="status-chip bg-white">零 AI 费用</span>
      </div>
      <label className="mt-4 block text-sm font-black">
        核心问题
        <textarea
          className="form-input mt-2 min-h-24 resize-y"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="例如：How would you prioritize this roadmap?"
          minLength={8}
          maxLength={500}
          required
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-black">
          分类
          <select
            className="form-input mt-2"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as InterviewQuestionCategory)
            }
          >
            {Object.entries(INTERVIEW_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {fixedApplicationId ? (
          <input type="hidden" value={fixedApplicationId} readOnly />
        ) : (
          <label className="text-sm font-black">
            关联岗位
            <select
              className="form-input mt-2"
              value={applicationId}
              onChange={(event) => setApplicationId(event.target.value)}
              required={category === "job_specific"}
            >
              <option value="">不关联岗位</option>
              {applications.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.roleTitle} · {application.companyName}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <button
        type="submit"
        className="button-primary mt-4 min-h-11 px-5 text-sm font-black disabled:cursor-wait disabled:opacity-60"
        disabled={busy}
      >
        {busy ? "正在加入…" : "加入题库"}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-bold text-[var(--error)]">
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          role="status"
          className="mt-3 text-sm font-bold text-[var(--mint-strong)]"
        >
          问题已加入，通用准备记录可继续复用。
        </p>
      ) : null}
    </form>
  );
}

const sourceLabels = {
  builtin: "内置通用题",
  manual: "手动加入",
  ai: "AI 建议",
} as const;

const statusColors: Record<InterviewPreparationStatus, string> = {
  not_started: "bg-white",
  outlined: "bg-[var(--mist-blue)]",
  practiced: "bg-[var(--cream)]",
  ready: "bg-[var(--mint)]",
};

export function QuestionPreparationCard({
  question,
  applicationId = null,
  availableFacts,
  updateQuestion,
  addVariant,
  refresh,
}: {
  question: InterviewQuestion;
  applicationId?: string | null;
  availableFacts: ConfirmedFactForAnalysis[];
  updateQuestion: BoundAction;
  addVariant: BoundAction;
  refresh?: () => void;
}) {
  const router = useRouter();
  const applicationLink = question.applicationLinks.find(
    (link) => link.applicationId === applicationId,
  );
  const [status, setStatus] = useState(question.preparationStatus);
  const [outline, setOutline] = useState(question.answerOutline ?? "");
  const [notes, setNotes] = useState(question.notes ?? "");
  const [selectedFacts, setSelectedFacts] = useState(
    () => new Set(question.facts.map((fact) => fact.id)),
  );
  const [variant, setVariant] = useState("");
  const [busy, setBusy] = useState<"preparation" | "variant" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sortedFacts = useMemo(
    () =>
      [...availableFacts].sort((left, right) => {
        const storyDelta = Number(right.factType === "story") - Number(left.factType === "story");
        return storyDelta || left.title.localeCompare(right.title);
      }),
    [availableFacts],
  );

  async function savePreparation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("preparation");
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("questionId", question.id);
    formData.set("applicationId", applicationId ?? "");
    formData.set("preparationStatus", status);
    formData.set("answerOutline", outline);
    formData.set("notes", notes);
    for (const factId of selectedFacts) formData.append("factIds", factId);
    try {
      const result = await updateQuestion(formData);
      const failure = resultError(result);
      if (failure) {
        setError(failure);
        return;
      }
      setMessage("准备记录已保存。");
      (refresh ?? router.refresh)();
    } catch {
      setError(errorMessages["interview-action-failed"]);
    } finally {
      setBusy(null);
    }
  }

  async function saveVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("variant");
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("questionId", question.id);
    formData.set("applicationId", applicationId ?? "");
    formData.set("wording", variant);
    try {
      const result = await addVariant(formData);
      const failure = resultError(result);
      if (failure) {
        setError(failure);
        return;
      }
      setVariant("");
      setMessage("问法变体已保存，核心问题没有重复创建。");
      (refresh ?? router.refresh)();
    } catch {
      setError(errorMessages["interview-action-failed"]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="status-chip bg-[var(--mist-blue)]">
          {INTERVIEW_CATEGORY_LABELS[question.category]}
        </span>
        <span className={`status-chip ${statusColors[question.preparationStatus]}`}>
          {INTERVIEW_STATUS_LABELS[question.preparationStatus]}
        </span>
        {applicationLink?.predicted || question.source === "ai" ? (
          <span className="status-chip bg-[var(--coral)] text-white">
            可能会问
          </span>
        ) : null}
        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">
          {sourceLabels[question.source]}
        </span>
      </div>
      <h3 className="heading-font mt-3 text-xl font-black leading-7">
        {question.prompt}
      </h3>
      {applicationLink?.relevanceReason ? (
        <p className="mt-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
          {applicationLink.relevanceReason}
        </p>
      ) : null}
      {applicationLink?.sourceExcerpt ? (
        <p className="mt-2 border-l-2 border-[var(--cream)] pl-3 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
          <span className="font-black text-[var(--ink)]">JD 依据：</span>
          “{applicationLink.sourceExcerpt}”
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black text-[var(--ink-muted)]">
        <span>{question.variants.length} 个问法变体</span>
        <span aria-hidden="true">·</span>
        <span>{question.facts.length} 条已关联事实</span>
        {question.applicationLinks.length ? (
          <>
            <span aria-hidden="true">·</span>
            <span>用于 {question.applicationLinks.length} 个岗位</span>
          </>
        ) : null}
      </div>
      {question.variants.length ? (
        <ul className="mt-3 space-y-1 border-l-2 border-[var(--mist-blue)] pl-3 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
          {question.variants.map((item) => (
            <li key={item.id}>也可能问：{item.wording}</li>
          ))}
        </ul>
      ) : null}

      <details className="mt-4 rounded-xl bg-[var(--canvas)] p-3">
        <summary className="cursor-pointer text-sm font-black">准备回答</summary>
        <form onSubmit={savePreparation} className="mt-4 space-y-4">
          <label className="block text-sm font-black">
            准备状态
            <select
              className="form-input mt-2"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as InterviewPreparationStatus)
              }
            >
              {INTERVIEW_PREPARATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {INTERVIEW_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-black">
            回答提纲
            <textarea
              className="form-input mt-2 min-h-32 resize-y"
              value={outline}
              onChange={(event) => setOutline(event.target.value)}
              placeholder="先写要点；涉及经历、数字和结果时只使用已确认事实。"
              maxLength={10_000}
            />
          </label>
          <label className="block text-sm font-black">
            练习笔记
            <textarea
              className="form-input mt-2 min-h-24 resize-y"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="例如：控制在 90 秒，先讲结论。"
              maxLength={10_000}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-black">关联已确认事实 / STAR</legend>
            {sortedFacts.length ? (
              <div className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded-xl border border-[var(--line)] bg-white p-3">
                {sortedFacts.map((fact) => (
                  <label
                    key={fact.id}
                    className="flex cursor-pointer items-start gap-3 text-xs font-semibold"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--mint-strong)]"
                      checked={selectedFacts.has(fact.id)}
                      onChange={(event) => {
                        setSelectedFacts((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(fact.id);
                          else next.delete(fact.id);
                          return next;
                        });
                      }}
                    />
                    <span>
                      <span className="font-black">{fact.title}</span>
                      <span className="mt-0.5 block text-[var(--ink-muted)]">
                        {fact.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs font-semibold text-[var(--ink-muted)]">
                还没有已确认事实，先去职业档案确认经历或 STAR 故事。
              </p>
            )}
          </fieldset>
          <button
            type="submit"
            className="button-primary min-h-10 px-4 text-xs font-black disabled:cursor-wait disabled:opacity-60"
            disabled={busy !== null}
          >
            {busy === "preparation" ? "正在保存…" : "保存准备记录"}
          </button>
        </form>

        <form
          onSubmit={saveVariant}
          className="mt-5 border-t border-[var(--line)] pt-4"
        >
          <label className="block text-sm font-black">
            新增问法变体
            <input
              className="form-input mt-2"
              value={variant}
              onChange={(event) => setVariant(event.target.value)}
              placeholder="同一个核心问题的另一种问法"
              minLength={8}
              maxLength={500}
              required
            />
          </label>
          <button
            type="submit"
            className="button-secondary mt-3 min-h-10 px-4 text-xs font-black disabled:cursor-wait disabled:opacity-60"
            disabled={busy !== null}
          >
            {busy === "variant" ? "正在保存…" : "保存为变体"}
          </button>
        </form>
      </details>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-bold text-[var(--error)]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="mt-3 text-sm font-bold text-[var(--mint-strong)]"
        >
          {message}
        </p>
      ) : null}
    </article>
  );
}
