import { applicationRepository } from "@/features/applications/repository";
import {
  addInterviewQuestionAction,
  addInterviewQuestionVariantAction,
  updateInterviewQuestionAction,
} from "@/features/interview-preparation/actions";
import {
  NewInterviewQuestionForm,
  QuestionPreparationCard,
} from "@/features/interview-preparation/components";
import { interviewPreparationRepository } from "@/features/interview-preparation/repository";
import {
  INTERVIEW_CATEGORY_LABELS,
  INTERVIEW_STATUS_LABELS,
  interviewQuestionFilterSchema,
  type InterviewQuestionCategory,
} from "@/features/interview-preparation/schemas";
import { listConfirmedFactsForAnalysis } from "@/features/jd-analysis/repository";
import { requireUser } from "@/lib/auth/require-user";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InterviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const filter = interviewQuestionFilterSchema.parse({
    q: first(query.q),
    category: first(query.category),
    status: first(query.status),
  });
  const [questions, applications, facts] = await Promise.all([
    interviewPreparationRepository.list(user.id),
    applicationRepository.list(user.id),
    listConfirmedFactsForAnalysis(user.id),
  ]);
  const normalizedQuery = filter.q.toLocaleLowerCase("zh-CN");
  const visibleQuestions = questions.filter(
    (question) =>
      (!filter.category || question.category === filter.category) &&
      (!filter.status || question.preparationStatus === filter.status) &&
      (!normalizedQuery ||
        question.prompt.toLocaleLowerCase("zh-CN").includes(normalizedQuery) ||
        question.variants.some((variant) =>
          variant.wording.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
        )),
  );
  const grouped = Object.keys(INTERVIEW_CATEGORY_LABELS).map((category) => ({
    category: category as InterviewQuestionCategory,
    questions: visibleQuestions.filter(
      (question) => question.category === category,
    ),
  }));
  const readyCount = questions.filter(
    (question) => question.preparationStatus === "ready",
  ).length;
  const practicedCount = questions.filter(
    (question) =>
      question.preparationStatus === "practiced" ||
      question.preparationStatus === "ready",
  ).length;

  return (
    <section className="min-w-0">
      <div className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--mist-blue)] p-5 shadow-[4px_4px_0_var(--ink)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.14em]">
              Interview preparation
            </p>
            <h1 className="heading-font mt-2 text-4xl font-black tracking-[-0.04em] sm:text-5xl">
              面试题库
            </h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-[var(--ink-muted)]">
              通用题只准备一次，每个岗位都会自动包含；职能、行业和岗位题作为增量加入。所有 AI 题都只表示“可能会问”。
            </p>
          </div>
          <span className="status-chip bg-white">{questions.length} 道核心题</span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["题库总数", questions.length],
            ["已练习", practicedCount],
            ["已准备", readyCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[var(--ink)] bg-white/80 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                {label}
              </p>
              <p className="heading-font mt-1 text-3xl font-black">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <NewInterviewQuestionForm
            applications={applications}
            addQuestion={addInterviewQuestionAction.bind(null, {})}
          />
          <form method="get" className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <h2 className="heading-font text-lg font-black">筛选题库</h2>
            <label className="mt-3 block text-sm font-black">
              搜索问题
              <input
                name="q"
                className="form-input mt-2"
                defaultValue={filter.q}
                placeholder="关键词或问法变体"
              />
            </label>
            <label className="mt-3 block text-sm font-black">
              分类
              <select
                name="category"
                className="form-input mt-2"
                defaultValue={filter.category ?? ""}
              >
                <option value="">全部分类</option>
                {Object.entries(INTERVIEW_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm font-black">
              状态
              <select
                name="status"
                className="form-input mt-2"
                defaultValue={filter.status ?? ""}
              >
                <option value="">全部状态</option>
                {Object.entries(INTERVIEW_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="button-secondary mt-4 min-h-10 px-4 text-xs font-black">
              应用筛选
            </button>
          </form>
        </aside>

        <div className="space-y-7">
          {grouped.map((group) =>
            group.questions.length ? (
              <section key={group.category}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                      {group.category === "common" ? "Reusable in every job" : "Incremental preparation"}
                    </p>
                    <h2 className="heading-font mt-1 text-2xl font-black">
                      {INTERVIEW_CATEGORY_LABELS[group.category]}
                    </h2>
                  </div>
                  <span className="status-chip bg-white">{group.questions.length} 道</span>
                </div>
                <div className="mt-4 space-y-3">
                  {group.questions.map((question) => (
                    <QuestionPreparationCard
                      key={question.id}
                      question={question}
                      availableFacts={facts}
                      updateQuestion={updateInterviewQuestionAction.bind(null, {})}
                      addVariant={addInterviewQuestionVariantAction.bind(null, {})}
                    />
                  ))}
                </div>
              </section>
            ) : null,
          )}
          {visibleQuestions.length === 0 ? (
            <article className="rounded-2xl border border-dashed border-[var(--ink-soft)] bg-white p-8 text-center">
              <p className="text-sm font-black">没有符合条件的问题</p>
              <p className="mt-2 text-xs font-semibold text-[var(--ink-muted)]">
                调整筛选，或在左侧加入一道新问题。
              </p>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
