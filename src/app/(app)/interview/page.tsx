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
  interviewQuestionFilterSchema,
  type InterviewQuestionCategory,
} from "@/features/interview-preparation/schemas";
import { listConfirmedFactsForAnalysis } from "@/features/jd-analysis/repository";
import { getDictionary } from "@/i18n/server";
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
  const { interview } = await getDictionary();
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
  const grouped = Object.keys(interview.categories).map((category) => ({
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
      {/* Was a mist-blue banner with a 2px border and a hard shadow — the last
          page still carrying the old vocabulary. Its body copy also failed
          contrast at 4.31:1 on that fill. */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              {interview.pageEyebrow}
            </p>
            <h1 className="heading-font mt-2 type-page-title">
              {interview.pageTitle}
            </h1>
            <p className="mt-3 type-caption text-[var(--ink-muted)]">
              {interview.pageBody}
            </p>
          </div>
          <span className="status-chip bg-[var(--paper)]">{interview.coreCount.replace("{count}", String(questions.length))}</span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            [interview.stats.total, questions.length],
            [interview.stats.practiced, practicedCount],
            [interview.stats.ready, readyCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[var(--ink)] bg-[color-mix(in_srgb,var(--paper)_80%,transparent)] p-4">
              <p className="type-eyebrow text-[var(--ink-muted)]">
                {label}
              </p>
              <p className="heading-font mt-1 text-3xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <NewInterviewQuestionForm
            copy={interview}
            applications={applications}
            addQuestion={addInterviewQuestionAction.bind(null, {})}
          />
          <form method="get" className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4">
            <h2 className="heading-font text-lg font-semibold">{interview.filterTitle}</h2>
            <label className="mt-3 block text-sm font-semibold">
              {interview.search}
              <input
                name="q"
                className="form-input mt-2"
                defaultValue={filter.q}
                placeholder={interview.searchPlaceholder}
              />
            </label>
            <label className="mt-3 block text-sm font-semibold">
              {interview.category}
              <select
                name="category"
                className="form-input mt-2"
                defaultValue={filter.category ?? ""}
              >
                <option value="">{interview.allCategories}</option>
                {Object.entries(interview.categories).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-sm font-semibold">
              {interview.status}
              <select
                name="status"
                className="form-input mt-2"
                defaultValue={filter.status ?? ""}
              >
                <option value="">{interview.allStatuses}</option>
                {Object.entries(interview.statuses).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="button-secondary mt-4 min-h-10 px-4 text-xs font-semibold">
              {interview.applyFilter}
            </button>
          </form>
        </aside>

        <div className="space-y-7">
          {grouped.map((group) =>
            group.questions.length ? (
              <section key={group.category}>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                      {group.category === "common" ? "Reusable in every job" : "Incremental preparation"}
                    </p>
                    <h2 className="heading-font mt-1 text-2xl font-bold">
                      {interview.categories[group.category]}
                    </h2>
                  </div>
                  <span className="status-chip bg-[var(--paper)]">{group.questions.length} {interview.countSuffix}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {group.questions.map((question) => (
                    <QuestionPreparationCard
                      copy={interview}
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
            <article className="rounded-2xl border border-dashed border-[var(--ink-soft)] bg-[var(--paper)] p-8 text-center">
              <p className="text-sm font-semibold">{interview.noMatches}</p>
              <p className="mt-2 text-xs font-semibold text-[var(--ink-muted)]">
                {interview.noMatchesBody}
              </p>
            </article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
