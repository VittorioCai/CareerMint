"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import type {
  CoverageStatus,
  CriterionConstraint,
  CriterionEvidenceStatus,
  CriterionGroupRule,
  CriterionKind,
  GapType,
  ImpactLevel,
  RequirementType,
} from "./schemas";

type ProfileFactView = {
  id: string;
  title: string;
  description: string;
  sourceExcerpt: string | null;
};

type AssessmentView = {
  resumeEvidenceStatus: CriterionEvidenceStatus;
  resumeExcerpt: string | null;
  gapType: GapType;
  reasonZh: string;
  userQuestionZh: string | null;
  profileFacts: ProfileFactView[];
};

type CriterionView = {
  id: string;
  groupKey: string;
  groupRule: CriterionGroupRule;
  kind: CriterionKind;
  originalText: string;
  translationZh: string;
  constraint: CriterionConstraint;
  sortOrder: number;
  assessment: AssessmentView | null;
};

type RequirementView = {
  id: string;
  category: string;
  requirementType: RequirementType;
  originalText: string;
  translationZh: string;
  sourceExcerpt: string;
  allowsEquivalent: boolean;
  explicitGate: boolean;
  sortOrder: number;
  result: {
    coverageStatus: CoverageStatus;
    impactLevel: ImpactLevel;
    coveredCriterionCount: number;
    missingCriterionCount: number;
  } | null;
  criteria: CriterionView[];
};

export type JDGapAnalysisViewModel = {
  run: {
    id: string;
    sourceFilename: string;
  };
  structureRun: {
    id: string;
    jdTranslationZh: string | null;
  };
  requirements: RequirementView[];
};

export type JDGapAnalysisPanelProps = {
  applicationId?: string;
  view: JDGapAnalysisViewModel | null;
  sourceText: string;
  legacyPanel?: ReactNode;
};

type Tab = "gaps" | "all" | "source";

const tabOptions: Array<{ id: Tab; label: string }> = [
  { id: "gaps", label: "待补差距" },
  { id: "all", label: "全部要求" },
  { id: "source", label: "JD 内容" },
];

const impactCopy: Record<ImpactLevel, string> = {
  blocking: "阻断差距",
  important: "重要差距",
  minor: "次要差距",
};

const coverageCopy: Record<CoverageStatus, { symbol: string; label: string; className: string }> = {
  complete: { symbol: "✓", label: "完全匹配", className: "bg-[var(--mint)]" },
  partial: { symbol: "◐", label: "部分匹配", className: "bg-[var(--mist-blue)]" },
  none: { symbol: "−", label: "未覆盖", className: "bg-[var(--coral)]" },
  needs_confirmation: { symbol: "?", label: "需要确认", className: "bg-[var(--cream)]" },
};

const evidenceCopy: Record<CriterionEvidenceStatus, string> = {
  direct: "简历中有直接证据",
  partial_direct: "找到部分简历证据",
  none: "未在简历中找到直接证据",
  needs_confirmation: "需要你确认这项经历",
};

const gapTypeCopy: Record<GapType, string> = {
  missing_from_resume: "简历未体现",
  too_vague: "表述过于笼统",
  missing_result_or_number: "缺少结果或数字",
  no_supporting_fact: "职业档案也没有支持事实",
  language_or_authorization_confirmation: "语言或工作许可需要确认",
  none: "没有差距",
};

const impactOrder: ImpactLevel[] = ["blocking", "important", "minor"];
const coverageRank: Record<CoverageStatus, number> = {
  none: 0,
  needs_confirmation: 1,
  partial: 2,
  complete: 3,
};

function coverage(requirement: RequirementView): CoverageStatus {
  return requirement.result?.coverageStatus ?? "needs_confirmation";
}

function impact(requirement: RequirementView): ImpactLevel {
  return requirement.result?.impactLevel ?? (
    requirement.explicitGate || requirement.requirementType === "required"
      ? "blocking"
      : requirement.requirementType === "core"
        ? "important"
        : "minor"
  );
}

function sorted(requirements: RequirementView[]) {
  return [...requirements].sort((left, right) =>
    impactOrder.indexOf(impact(left)) - impactOrder.indexOf(impact(right)) ||
    coverageRank[coverage(left)] - coverageRank[coverage(right)] ||
    left.sortOrder - right.sortOrder ||
    left.id.localeCompare(right.id),
  );
}

function RequirementRow({ requirement }: { requirement: RequirementView }) {
  const [expanded, setExpanded] = useState(false);
  const state = coverageCopy[coverage(requirement)];
  const regionId = `jd-gap-detail-${requirement.id}`;

  return (
    <article
      className="border-t border-[var(--line)] first:border-t-0"
      data-testid={`gap-requirement-${requirement.id}`}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors duration-150 hover:bg-[var(--paper)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--mist-blue)] sm:px-5"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span aria-hidden="true" className="mt-0.5 w-4 shrink-0 text-sm font-black">
          {expanded ? "⌄" : "›"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-black leading-6">
            {requirement.translationZh}
          </span>
          <span className="mt-1 block break-words text-xs font-semibold leading-5 text-[var(--ink-muted)]" lang="und">
            {requirement.originalText}
          </span>
        </span>
        <span className={`status-chip shrink-0 ${state.className}`}>
          <span aria-hidden="true">{state.symbol}</span> {state.label}
        </span>
      </button>

      {expanded ? (
        <div id={regionId} className="border-t border-[var(--line)] bg-[var(--paper)] px-4 py-5 sm:px-10">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
            <div>
              <p className="text-xs font-black tracking-[0.08em] text-[var(--ink-muted)]">逐项条件</p>
              <ol className="mt-3 space-y-4">
                {requirement.criteria.map((criterion) => {
                  const assessment = criterion.assessment;
                  const missing = assessment?.resumeEvidenceStatus !== "direct";
                  return (
                    <li key={criterion.id} className="border-t border-[var(--line)] pt-4 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-black leading-6">{criterion.translationZh}</p>
                          <p className="mt-1 break-words text-xs font-semibold leading-5 text-[var(--ink-muted)]" lang="und">
                            {criterion.originalText}
                          </p>
                        </div>
                        {missing ? <span className="status-chip bg-[var(--cream)]">! 缺少条件</span> : null}
                      </div>
                      <p className="mt-3 text-sm font-bold">
                        {assessment ? evidenceCopy[assessment.resumeEvidenceStatus] : "尚未核对这项条件"}
                      </p>
                      {assessment?.resumeExcerpt ? (
                        <blockquote className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--paper-warm)] px-4 py-3 text-sm font-semibold leading-6">
                          <span className="mb-1 block text-xs font-black text-[var(--ink-muted)]">简历原句</span>
                          “{assessment.resumeExcerpt}”
                        </blockquote>
                      ) : null}
                      {assessment?.profileFacts.length ? (
                        <div className="mt-3">
                          <p className="text-xs font-black text-[var(--ink-muted)]">职业档案支持</p>
                          <ul className="mt-2 space-y-2">
                            {assessment.profileFacts.map((fact) => (
                              <li key={fact.id} className="rounded-xl border border-[var(--line)] bg-[var(--paper-warm)] px-4 py-3">
                                <p className="text-sm font-black">{fact.title}</p>
                                <p className="mt-1 text-xs font-semibold leading-5 text-[var(--ink-muted)]">{fact.description}</p>
                                {fact.sourceExcerpt ? (
                                  <p className="mt-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">来源：{fact.sourceExcerpt}</p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {assessment ? (
                        <div className="mt-3 grid gap-2 text-sm leading-6">
                          <p><span className="font-black">差距类型：</span>{gapTypeCopy[assessment.gapType]}</p>
                          <p><span className="font-black">判断理由：</span>{assessment.reasonZh}</p>
                          {assessment.userQuestionZh ? (
                            <p><span className="font-black">建议确认：</span>{assessment.userQuestionZh}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
            <aside>
              <p className="text-xs font-black tracking-[0.08em] text-[var(--ink-muted)]">JD 原始依据</p>
              <p className="mt-3 break-words text-sm font-semibold leading-6" lang="und">
                {requirement.sourceExcerpt}
              </p>
              {requirement.allowsEquivalent ? (
                <p className="mt-3 text-xs font-bold text-[var(--ink-muted)]">允许同类专业、工具或经历作为等价证据。</p>
              ) : null}
            </aside>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function GapGroups({ requirements }: { requirements: RequirementView[] }) {
  const [showAll, setShowAll] = useState<Record<ImpactLevel, boolean>>({
    blocking: false,
    important: false,
    minor: false,
  });

  return (
    <div className="space-y-5" aria-label="待补差距列表">
      {impactOrder.map((level) => {
        const items = sorted(requirements.filter((requirement) => impact(requirement) === level));
        if (items.length === 0) return null;
        const visible = showAll[level] ? items : items.slice(0, 5);
        const remaining = items.length - visible.length;
        return (
          <section key={level} className="dense-surface overflow-hidden" aria-labelledby={`gap-group-${level}`}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <h3 id={`gap-group-${level}`} className="text-sm font-black">{impactCopy[level]}</h3>
              <span className="text-xs font-black text-[var(--ink-muted)]">{items.length} 项</span>
            </div>
            <div className="border-t border-[var(--line)]">
              {visible.map((requirement) => <RequirementRow key={requirement.id} requirement={requirement} />)}
            </div>
            {remaining > 0 ? (
              <div className="border-t border-[var(--line)] px-4 py-3 sm:px-5">
                <button
                  type="button"
                  className="text-sm font-black underline decoration-[var(--mist-blue)] decoration-2 underline-offset-4"
                  onClick={() => setShowAll((current) => ({ ...current, [level]: true }))}
                >
                  还有 {remaining} 条，展开全部
                </button>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function CompletedRequirements({ requirements }: { requirements: RequirementView[] }) {
  if (requirements.length === 0) return null;
  return (
    <details className="dense-surface overflow-hidden">
      <summary className="cursor-pointer px-4 py-4 text-sm font-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--mist-blue)] sm:px-5">
        完整匹配（{requirements.length}）
      </summary>
      <div className="border-t border-[var(--line)]">
        {requirements.map((requirement) => <RequirementRow key={requirement.id} requirement={requirement} />)}
      </div>
    </details>
  );
}

function MarkdownExportControl({ applicationId }: { applicationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function download() {
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/jd-gap/export`,
      );
      if (!response.ok) throw new Error("jd-gap-export-failed");
      const objectUrl = URL.createObjectURL(await response.blob());
      const disposition = response.headers.get("content-disposition") ?? "";
      const encodedName = /filename\*=UTF-8''([^;]+)/iu.exec(disposition)?.[1];
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = encodedName
        ? decodeURIComponent(encodedName)
        : "jd-gap-analysis.md";
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setMessage("Markdown 已下载。文件只包含当前未解决差距。");
    } catch {
      setFailed(true);
      setMessage("暂时无法导出，请确认当前差距分析已完成后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="button-secondary min-h-10 px-4 text-sm font-black disabled:cursor-wait disabled:opacity-60"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "正在导出…" : "导出 Markdown"}
      </button>
      {message ? (
        <p
          role={failed ? "alert" : "status"}
          className={`mt-2 text-xs font-bold ${failed ? "text-[var(--error)]" : "text-[var(--ink-muted)]"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function JDGapAnalysisPanel({
  applicationId,
  view,
  sourceText,
  legacyPanel,
}: JDGapAnalysisPanelProps) {
  const [tab, setTab] = useState<Tab>("gaps");

  if (!view) {
    return (
      <section className="space-y-4" aria-labelledby="jd-gap-analysis-title">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">Evidence map</p>
          <h2 id="jd-gap-analysis-title" className="heading-font mt-1 text-3xl font-black">JD 差距分析</h2>
        </div>
        {legacyPanel ? (
          <>
            <aside className="rounded-2xl border border-[var(--line)] bg-[var(--cream)] px-4 py-3 text-sm font-black">
              这是旧版分析，请重新分析以查看详细差距。
            </aside>
            {legacyPanel}
          </>
        ) : (
          <div className="dense-surface px-5 py-8 text-sm font-semibold text-[var(--ink-muted)]">
            尚未生成差距结果。选择对照简历后，点击上方按钮开始分析。
          </div>
        )}
      </section>
    );
  }

  const all = sorted(view.requirements);
  const incomplete = all.filter((requirement) => coverage(requirement) !== "complete");
  const complete = all.filter((requirement) => coverage(requirement) === "complete");
  const partialCount = all.filter((requirement) => coverage(requirement) === "partial").length;
  const noneCount = all.filter((requirement) => coverage(requirement) === "none").length;
  const blockingCount = incomplete.filter((requirement) => impact(requirement) === "blocking").length;

  return (
    <section className="space-y-5" aria-labelledby="jd-gap-analysis-title">
      <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">Evidence map</p>
          <h2 id="jd-gap-analysis-title" className="heading-font mt-1 text-3xl font-black">JD 差距分析</h2>
          <p className="mt-2 text-sm font-semibold text-[var(--ink-muted)]">
            对照简历：<span className="break-words font-black text-[var(--ink)]">{view.run.sourceFilename}</span>
          </p>
        </div>
        <span className="status-chip self-start bg-[var(--mint)] sm:self-auto">✓ 已核对</span>
      </header>

      <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper-warm)] sm:grid-cols-5" aria-label="JD 差距摘要">
        {[
          ["总要求", all.length],
          ["完全匹配", complete.length],
          ["部分匹配", partialCount],
          ["未覆盖", noneCount],
          ["阻断项", blockingCount],
        ].map(([label, value], index) => (
          <div key={label} className={`${index > 0 ? "border-l border-[var(--line)]" : ""} border-t border-[var(--line)] px-4 py-3 first:border-t-0 sm:border-t-0`}>
            <dt className="text-xs font-bold text-[var(--ink-muted)]">{label}</dt>
            <dd className="mt-1 text-xl font-black">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="JD 差距视图">
        {tabOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            className={`min-h-11 whitespace-nowrap rounded-xl border-2 border-[var(--ink)] px-4 text-sm font-black ${tab === option.id ? "bg-[var(--cream)] shadow-[2px_2px_0_var(--ink)]" : "bg-[var(--paper-warm)]"}`}
            onClick={() => setTab(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === "gaps" && applicationId && incomplete.length ? (
        <div className="flex justify-end">
          <MarkdownExportControl applicationId={applicationId} />
        </div>
      ) : null}

      <div role="tabpanel">
        {tab === "gaps" ? (
          incomplete.length ? <GapGroups requirements={incomplete} /> : (
            <div className="dense-surface px-5 py-8 text-sm font-semibold text-[var(--ink-muted)]">当前没有待补差距。</div>
          )
        ) : null}
        {tab === "all" ? (
          <div className="space-y-5">
            {incomplete.length ? <GapGroups requirements={incomplete} /> : null}
            <CompletedRequirements requirements={complete} />
          </div>
        ) : null}
        {tab === "source" ? (
          <section className="dense-surface overflow-hidden">
            <div className="px-5 py-5">
              <p className="text-xs font-black tracking-[0.08em] text-[var(--ink-muted)]">中文翻译</p>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm font-semibold leading-7">
                {view.structureRun.jdTranslationZh ?? "暂无中文翻译。"}
              </p>
            </div>
            <details className="border-t border-[var(--line)]">
              <summary className="cursor-pointer px-5 py-4 text-sm font-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--mist-blue)]">
                查看 JD 原文
              </summary>
              <p className="whitespace-pre-wrap break-words border-t border-[var(--line)] px-5 py-5 text-sm font-semibold leading-7 text-[var(--ink-muted)]" lang="und">
                {sourceText}
              </p>
            </details>
          </section>
        ) : null}
      </div>
    </section>
  );
}
