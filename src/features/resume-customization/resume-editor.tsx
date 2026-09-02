"use client";

import { useMemo, useState } from "react";

import type {
  ResumeSection,
  ResumeSuggestionRecord,
  ResumeVersion,
} from "./schemas";

const sectionLabels: Record<ResumeSection, string> = {
  summary: "职业摘要",
  experience: "工作经历",
  project: "项目经历",
  education: "教育背景",
  skills: "技能",
  certification: "证书",
  language: "语言",
  achievement: "量化成果",
};

const decisionLabels = {
  pending: "待审核",
  accepted: "已接受",
  rejected: "已拒绝",
} as const;

type ActionResult = { ok: boolean; error?: string };
type VersionActionResult = ActionResult & {
  versionId?: string;
  versionNumber?: number;
};

function statusClass(decision: ResumeSuggestionRecord["decision"]) {
  if (decision === "accepted") return "bg-[var(--mint)]";
  if (decision === "rejected") return "bg-[#f2f2ef]";
  return "bg-[var(--cream)]";
}

export function ResumeEditor({
  applicationId,
  runId,
  companyName,
  roleTitle,
  suggestions,
  versions,
  reviewSuggestion,
  saveVersion,
  navigate = (href) => window.location.assign(href),
}: {
  applicationId: string;
  runId: string;
  companyName: string;
  roleTitle: string;
  suggestions: ResumeSuggestionRecord[];
  versions: ResumeVersion[];
  reviewSuggestion: (input: {
    applicationId: string;
    suggestionId: string;
    decision: "pending" | "accepted" | "rejected";
    reviewedContent: string | null;
  }) => Promise<ActionResult>;
  saveVersion: (input: {
    applicationId: string;
    runId: string;
    template: "simple" | "modern";
  }) => Promise<VersionActionResult>;
  navigate?: (href: string) => void;
}) {
  const [items, setItems] = useState(suggestions);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [template, setTemplate] = useState<"simple" | "modern">("simple");
  const [error, setError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<
    "content" | "suggestions" | "evidence"
  >("content");

  const visibleItems = items.filter((item) => item.decision !== "rejected");
  const acceptedCount = items.filter(
    (item) => item.decision === "accepted",
  ).length;
  const sectionCounts = useMemo(() => {
    const counts = new Map<ResumeSection, number>();
    for (const item of visibleItems) {
      counts.set(item.section, (counts.get(item.section) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [visibleItems]);

  async function review(
    item: ResumeSuggestionRecord,
    decision: "accepted" | "rejected",
    reviewedContent: string | null,
  ) {
    setBusyId(item.id);
    setError(null);
    const result = await reviewSuggestion({
      applicationId,
      suggestionId: item.id,
      decision,
      reviewedContent,
    });
    setBusyId(null);
    if (!result.ok) {
      setError(
        result.error === "unsupported-resume-claim"
          ? "编辑内容加入了事实证据中没有的数字或日期。请保留原事实，或先回职业档案补充并确认。"
          : "这条建议暂时无法保存，原内容仍保留，请重试。",
      );
      return;
    }
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, decision, reviewedContent }
          : candidate,
      ),
    );
    setEditingId(null);
  }

  async function createVersion() {
    if (acceptedCount === 0 || saving) return;
    setSaving(true);
    setError(null);
    const result = await saveVersion({ applicationId, runId, template });
    setSaving(false);
    if (!result.ok || !result.versionId) {
      setError("还不能保存版本。请确认至少接受一条仍有事实证据的建议。");
      return;
    }
    navigate(`/applications/${applicationId}/resume/${result.versionId}`);
  }

  return (
    <section className="min-w-0">
      <div className="mb-4 flex flex-col gap-4 rounded-2xl border-2 border-[var(--ink)] bg-[var(--mint)] p-4 shadow-[3px_3px_0_var(--ink)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em]">
            {companyName} · {roleTitle}
          </p>
          <h1 className="heading-font mt-1 text-2xl font-black">
            审核岗位简历建议
          </h1>
          <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">
            {acceptedCount} 条已接受 · {versions.length} 个历史版本
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-black">
            简历模板
            <select
              aria-label="简历模板"
              className="form-input mt-1 min-h-10 py-1"
              value={template}
              onChange={(event) =>
                setTemplate(event.target.value as "simple" | "modern")
              }
            >
              <option value="simple">简洁</option>
              <option value="modern">现代</option>
            </select>
          </label>
          <button
            type="button"
            className="button-primary min-h-11 px-5 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
            disabled={acceptedCount === 0 || saving}
            onClick={() => void createVersion()}
          >
            {saving ? "正在保存…" : "保存为新版本"}
          </button>
        </div>
      </div>

      <div
        className="mb-4 grid grid-cols-3 gap-2 lg:hidden"
        aria-label="手机编辑器视图"
      >
        {[
          ["content", "正文"],
          ["suggestions", "建议"],
          ["evidence", "证据"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mobileView === value}
            className={`rounded-xl border px-3 py-2 text-xs font-black ${
              mobileView === value
                ? "border-2 border-[var(--ink)] bg-[var(--cream)]"
                : "border-[var(--line)] bg-white"
            }`}
            onClick={() =>
              setMobileView(value as "content" | "suggestions" | "evidence")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-[var(--error)] bg-[#fff0ee] p-3 text-sm font-bold text-[var(--error)]"
        >
          {error}
        </p>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[210px_minmax(420px,1fr)_360px]">
        <aside
          className={`${mobileView === "suggestions" ? "block" : "hidden"} dense-surface self-start p-4 lg:block`}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            Structure
          </p>
          <h2 className="heading-font mt-1 text-lg font-black">简历结构</h2>
          <nav className="mt-4 space-y-2" aria-label="简历章节">
            {sectionCounts.map(([section, count]) => (
              <a
                key={section}
                href={`#resume-section-${section}`}
                className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-black"
              >
                {sectionLabels[section]}
                <span className="status-chip bg-[var(--mint)]">{count}</span>
              </a>
            ))}
          </nav>
          <div className="mt-5 border-t border-[var(--line)] pt-4 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
            拒绝的项目不会进入版本；保存时只快照已接受项目及其事实证据。
          </div>
        </aside>

        <main
          className={`${mobileView === "content" ? "block" : "hidden"} min-w-0 lg:block`}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="heading-font text-lg font-black">正文预览</h2>
            <span className="status-chip bg-white">接近导出效果</span>
          </div>
          <article className="min-h-[720px] border border-[var(--line)] bg-white px-6 py-8 shadow-[0_12px_32px_rgba(41,55,51,0.08)] sm:px-10">
            <header className="border-b-2 border-[var(--ink)] pb-5">
              <p className="heading-font text-2xl font-black">{roleTitle}</p>
              <p className="mt-1 text-sm font-bold text-[var(--ink-muted)]">
                Tailored for {companyName}
              </p>
            </header>
            {sectionCounts.map(([section]) => (
              <section
                key={section}
                id={`resume-section-${section}`}
                className="mt-6 scroll-mt-6"
              >
                <h3 className="text-xs font-black uppercase tracking-[0.14em]">
                  {sectionLabels[section]}
                </h3>
                <div className="mt-3 space-y-3">
                  {visibleItems
                    .filter((item) => item.section === section)
                    .map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-lg border px-4 py-3 ${
                          item.decision === "accepted"
                            ? "border-[var(--mint-strong)] bg-white"
                            : "border-[var(--ink-soft)] bg-[#fbfbf8]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium leading-6">
                            {item.reviewedContent ?? item.content}
                          </p>
                          <span
                            className={`status-chip ${statusClass(item.decision)}`}
                          >
                            {decisionLabels[item.decision]}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            ))}
            {visibleItems.length === 0 ? (
              <div className="grid min-h-80 place-items-center text-center">
                <p className="max-w-sm text-sm font-semibold leading-6 text-[var(--ink-muted)]">
                  目前没有进入预览的建议。可以重新生成，或回到职业档案补充并确认事实。
                </p>
              </div>
            ) : null}
          </article>
        </main>

        <aside
          className={`${mobileView === "evidence" ? "block" : "hidden"} min-w-0 space-y-3 lg:block`}
        >
          <div className="flex items-center justify-between">
            <h2 className="heading-font text-lg font-black">建议与证据</h2>
            <span className="status-chip bg-[var(--coral)] text-white">
              AI 草稿
            </span>
          </div>
          {items.map((item, index) => (
            <article
              key={item.id}
              className="rounded-2xl border border-[var(--line)] bg-white p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                  {String(index + 1).padStart(2, "0")} · {sectionLabels[item.section]}
                </p>
                <span className={`status-chip ${statusClass(item.decision)}`}>
                  {decisionLabels[item.decision]}
                </span>
              </div>
              <p className="mt-3 text-sm font-bold leading-6">
                {item.reviewedContent ?? item.content}
              </p>
              <p className="mt-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
                {item.reason}
              </p>

              {editingId === item.id ? (
                <div className="mt-4">
                  <label className="text-xs font-black">
                    编辑建议文本
                    <textarea
                      aria-label="编辑建议文本"
                      className="form-input mt-2 min-h-32 resize-y"
                      value={editText}
                      maxLength={700}
                      onChange={(event) => setEditText(event.target.value)}
                    />
                  </label>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="button-primary min-h-10 px-3 text-xs font-black"
                      disabled={!editText.trim() || busyId === item.id}
                      onClick={() =>
                        void review(item, "accepted", editText.trim())
                      }
                    >
                      保存并接受
                    </button>
                    <button
                      type="button"
                      className="button-secondary min-h-10 px-3 text-xs font-black"
                      onClick={() => setEditingId(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.decision !== "accepted" ? (
                    <button
                      type="button"
                      className="button-primary min-h-10 px-3 text-xs font-black"
                      disabled={busyId === item.id}
                      onClick={() => void review(item, "accepted", null)}
                    >
                      接受
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button-secondary min-h-10 px-3 text-xs font-black"
                    disabled={busyId === item.id}
                    onClick={() => {
                      setEditingId(item.id);
                      setEditText(item.reviewedContent ?? item.content);
                    }}
                  >
                    {item.decision === "accepted" ? "修改措辞" : "编辑后接受"}
                  </button>
                  {item.decision !== "rejected" ? (
                    <button
                      type="button"
                      className="min-h-10 rounded-xl border border-[var(--line)] px-3 text-xs font-black text-[var(--error)]"
                      disabled={busyId === item.id}
                      onClick={() => void review(item, "rejected", null)}
                    >
                      拒绝
                    </button>
                  ) : null}
                </div>
              )}

              <details className="mt-4 border-t border-[var(--line)] pt-3" open>
                <summary className="cursor-pointer text-xs font-black">
                  事实与 JD 证据
                </summary>
                <div className="mt-3 space-y-3">
                  {item.requirements.map((requirement) => (
                    <div
                      key={requirement.id}
                      className="rounded-xl bg-[var(--mist-blue)] p-3"
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.12em]">
                        JD 要求 · {requirement.priority === "core" ? "核心" : "辅助"}
                      </p>
                      <p className="mt-1 text-xs font-bold leading-5">
                        {requirement.text}
                      </p>
                    </div>
                  ))}
                  {item.facts.map((fact) => (
                    <div
                      key={fact.id}
                      className="rounded-xl border border-[var(--line)] p-3"
                    >
                      <p className="text-xs font-black">{fact.title}</p>
                      <p className="mt-1 text-xs font-medium leading-5 text-[var(--ink-muted)]">
                        {fact.description}
                      </p>
                      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                        {fact.sourceExcerpt
                          ? "来源：原始简历文字"
                          : "来源：已确认职业事实"}
                      </p>
                    </div>
                  ))}
                  {item.facts.length === 0 ? (
                    <p className="text-xs font-bold text-[var(--error)]">
                      当前事实证据不可用；这条内容不能保存进新版本。
                    </p>
                  ) : null}
                </div>
              </details>
            </article>
          ))}
        </aside>
      </div>
    </section>
  );
}
