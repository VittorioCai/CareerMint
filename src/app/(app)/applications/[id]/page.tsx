import Link from "next/link";
import { notFound } from "next/navigation";

import {
  changeApplicationStageAction,
  setApplicationResumeSourceAction,
} from "@/features/applications/actions";
import { applicationRepository } from "@/features/applications/repository";
import {
  APPLICATION_STAGE_LABELS,
  WORKPLACE_MODE_LABELS,
  type Application,
  type ApplicationStageEvent,
} from "@/features/applications/schemas";
import { StageUpdateForm } from "@/features/applications/stage-update-form";
import { AnalysisControl } from "@/features/jd-analysis/analysis-control";
import { jdAnalysisRepository } from "@/features/jd-analysis/repository";
import { RequirementsPanel } from "@/features/jd-analysis/requirements-panel";
import type {
  JDAnalysisRun,
  JDRequirementRecord,
} from "@/features/jd-analysis/schemas";
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
import type { InterviewQuestion } from "@/features/interview-preparation/schemas";
import {
  acceptInterviewQuestionCandidatesAction,
  rejectInterviewQuestionCandidatesAction,
} from "@/features/interview-preparation/generation-actions";
import { InterviewQuestionGenerationControl } from "@/features/interview-preparation/generation-control";
import { interviewQuestionGenerationRepository } from "@/features/interview-preparation/generation-repository";
import type {
  InterviewQuestionGenerationCandidateRecord,
  InterviewQuestionGenerationRun,
} from "@/features/interview-preparation/generation-service";
import { listConfirmedFactsForAnalysis } from "@/features/jd-analysis/repository";
import type { ConfirmedFactForAnalysis } from "@/features/jd-analysis/schemas";
import { getAIProcessingConsentAt } from "@/features/account/repository";
import { resumeCustomizationRepository } from "@/features/resume-customization/repository";
import type {
  ResumeVersion,
} from "@/features/resume-customization/schemas";
import { requireUser } from "@/lib/auth/require-user";
import { listAssets } from "@/features/source-assets/repository";
import {
  BaselineSelector,
  type ResumeAssetOption,
} from "@/features/resume-gaps/baseline-selector";
import { GapAnalysisControl } from "@/features/resume-gaps/gap-analysis-control";
import { GapPanel } from "@/features/resume-gaps/gap-panel";
import { resumeGapRepository } from "@/features/resume-gaps/repository";

const tabs = ["overview", "jd", "resume", "interview", "timeline"] as const;
type DetailTab = (typeof tabs)[number];

const tabLabels: Record<DetailTab, string> = {
  overview: "概览",
  jd: "JD",
  resume: "简历",
  interview: "面试准备",
  timeline: "时间线",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function detailTab(value: string | undefined): DetailTab {
  return tabs.includes(value as DetailTab) ? (value as DetailTab) : "overview";
}

function formatDate(value: string | null) {
  if (!value) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function Overview({ application }: { application: Application }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["当前阶段", APPLICATION_STAGE_LABELS[application.stage]],
          ["阶段开始", formatDate(application.stageChangedAt)],
          ["首次投递", formatDate(application.appliedAt)],
          ["办公方式", WORKPLACE_MODE_LABELS[application.workplaceMode]],
          ["来源", application.source ?? "未填写"],
          ["下一步", application.nextAction ?? "尚未设置"],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border border-[var(--line)] bg-white p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">
              {label}
            </p>
            <p className="mt-2 break-words text-sm font-black">{value}</p>
          </article>
        ))}
      </div>
      <aside className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--cream)] p-5 shadow-[3px_3px_0_var(--ink)]">
        <p className="text-xs font-black uppercase tracking-[0.12em]">更新进度</p>
        <h2 className="heading-font mt-2 text-xl font-black">发生了什么？记下来</h2>
        <p className="mt-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
          每次更新都会保留发生日期和阶段事件，不会静默覆盖历史。
        </p>
        <div className="mt-4 border-t border-[color:var(--ink-soft)] pt-4">
          <StageUpdateForm
            applicationId={application.id}
            currentStage={application.stage}
            changeStage={changeApplicationStageAction.bind(null, {})}
          />
        </div>
      </aside>
    </div>
  );
}

function JdPanel({
  application,
  analysisRun,
  requirements,
}: {
  application: Application;
  analysisRun: JDAnalysisRun | null;
  requirements: JDRequirementRecord[];
}) {
  return (
    <div className="space-y-6">
      <AnalysisControl
        applicationId={application.id}
        analysisRunId={analysisRun?.id ?? null}
        initialStatus={analysisRun?.status ?? null}
        initialResult={
          analysisRun?.result
            ? {
                acceptedRequirementCount:
                  analysisRun.result.acceptedRequirementCount,
                estimatedCost: analysisRun.result.estimatedCost
                  ? {
                      amount: analysisRun.result.estimatedCost.amount,
                      currency: analysisRun.result.estimatedCost.currency,
                    }
                  : null,
              }
            : null
        }
      />
      <RequirementsPanel
        requirements={requirements}
        analysisRunId={analysisRun?.id ?? null}
        sourceText={application.jdText}
        sourceUrl={application.jobUrl}
      />
    </div>
  );
}

function Timeline({ events }: { events: ApplicationStageEvent[] }) {
  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 sm:grid-cols-[150px_minmax(0,1fr)]">
          <time className="text-xs font-black text-[var(--ink-muted)]" dateTime={event.occurredAt}>
            {formatDate(event.occurredAt)}
          </time>
          <div>
            <p className="text-sm font-black">
              {event.fromStage
                ? `${APPLICATION_STAGE_LABELS[event.fromStage]} → ${APPLICATION_STAGE_LABELS[event.toStage]}`
                : `建立申请 · ${APPLICATION_STAGE_LABELS[event.toStage]}`}
            </p>
            {event.note ? (
              <p className="mt-1 text-sm font-medium leading-6 text-[var(--ink-muted)]">{event.note}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ResumePanel({
  application,
  analysisRun,
  requirements,
  latestGapRun,
  fallbackGapRun,
  gapItems,
  versions,
  selectedAsset,
  availableAssets,
  setupMode,
}: {
  application: Application;
  analysisRun: JDAnalysisRun | null;
  requirements: JDRequirementRecord[];
  latestGapRun: Awaited<ReturnType<typeof resumeGapRepository.getLatest>>;
  fallbackGapRun: Awaited<ReturnType<typeof resumeGapRepository.getLatestSucceeded>>;
  gapItems: Awaited<ReturnType<typeof resumeGapRepository.listItems>>;
  versions: ResumeVersion[];
  selectedAsset: ResumeAssetOption | null;
  availableAssets: ResumeAssetOption[];
  setupMode: boolean;
}) {
  const currentGapRun = latestGapRun && selectedAsset && latestGapRun.sourceAssetId === selectedAsset.id && latestGapRun.analysisRunId === analysisRun?.id
    ? latestGapRun
    : null;
  return (
    <div className="space-y-6">
      <header>
        <h2 id="resume-gap-page-title" className="heading-font text-3xl font-black">简历差距</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--ink-muted)]">只读比较当前 JD 与这次申请的对照简历，职业档案事实仅作为已确认补充。</p>
      </header>
      <BaselineSelector
        applicationId={application.id}
        selectedAsset={selectedAsset}
        availableAssets={availableAssets}
        setupMode={setupMode}
        setResumeSource={setApplicationResumeSourceAction.bind(null, {})}
      />

      {!analysisRun ? (
        <section className="dense-surface min-w-0 p-5 sm:p-6" aria-labelledby="resume-gap-empty-title">
          <p id="resume-gap-empty-title" className="text-sm font-semibold leading-6 text-[var(--ink-muted)]">
            先完成 JD 分析，才能判断简历差距。
          </p>
          <Link href={`/applications/${application.id}?tab=jd`} className="mt-4 inline-flex text-sm font-black underline underline-offset-4">
            返回 JD 分析 →
          </Link>
        </section>
      ) : (
        <>
          {selectedAsset ? (
            <GapAnalysisControl
              key={`${selectedAsset.id}:${analysisRun.id}`}
              applicationId={application.id}
              asset={selectedAsset}
              initialRun={currentGapRun ? {
                id: currentGapRun.id,
                status: currentGapRun.status,
                errorCode: currentGapRun.errorCode,
                sourceFilename: currentGapRun.sourceFilename,
                sourceAssetId: currentGapRun.sourceAssetId,
                analysisRunId: currentGapRun.analysisRunId,
                result: currentGapRun.result ? {
                  acceptedItemCount: currentGapRun.result.acceptedItemCount,
                  estimatedCost: currentGapRun.result.estimatedCost,
                } : null,
              } : null}
            />
          ) : null}
          <GapPanel
            key={`${selectedAsset?.id ?? "profile"}:${analysisRun.id}`}
            applicationId={application.id}
            baseline={selectedAsset}
            requirements={requirements.map((requirement) => ({
              id: requirement.id,
              category: requirement.category,
              text: requirement.text,
              priority: requirement.priority,
              sortOrder: requirement.sortOrder,
              sourceExcerpt: requirement.sourceExcerpt,
              matchStatus: requirement.matchStatus,
              matchReason: requirement.matchReason,
              evidence: requirement.evidence,
            }))}
            run={latestGapRun ? {
              id: latestGapRun.id,
              status: latestGapRun.status,
              errorCode: latestGapRun.errorCode,
              sourceFilename: latestGapRun.sourceFilename,
              sourceAssetId: latestGapRun.sourceAssetId,
              analysisRunId: latestGapRun.analysisRunId,
            } : null}
            fallbackRun={fallbackGapRun ? {
              id: fallbackGapRun.id,
              status: fallbackGapRun.status,
              errorCode: fallbackGapRun.errorCode,
              sourceFilename: fallbackGapRun.sourceFilename,
              sourceAssetId: fallbackGapRun.sourceAssetId,
              analysisRunId: fallbackGapRun.analysisRunId,
            } : null}
            items={gapItems}
            currentAnalysisRunId={analysisRun.id}
          />
        </>
      )}

      <section>
        <details className="dense-surface min-w-0 p-5 sm:p-6">
          <summary className="cursor-pointer list-none text-sm font-black">历史版本 <span className="ml-2 text-xs font-bold text-[var(--ink-muted)]">{versions.length} 个版本</span></summary>
          {versions.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {versions.map((version) => (
              <Link
                key={version.id}
                href={`/applications/${application.id}/resume/${version.id}`}
                className="group rounded-2xl border border-[var(--line)] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[var(--ink)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="status-chip bg-[var(--mint)]">
                    V{version.versionNumber}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                    {version.template === "modern" ? "现代" : "简洁"}
                  </span>
                </div>
                <p className="mt-4 text-sm font-black">
                  {version.items.length} 条已核对内容
                </p>
                <p className="mt-1 text-xs font-semibold text-[var(--ink-muted)]">
                  {formatDate(version.createdAt)} · 不可变快照
                </p>
                <p className="mt-4 text-xs font-black underline underline-offset-4">
                  查看版本 →
                </p>
              </Link>
            ))}
          </div>
          ) : <p className="mt-4 text-sm font-semibold text-[var(--ink-muted)]">还没有简历版本。</p>}
        </details>
      </section>
    </div>
  );
}

function InterviewPanel({
  application,
  questions,
  facts,
  generationRun,
  generationCandidates,
  consentRequired,
}: {
  application: Application;
  questions: InterviewQuestion[];
  facts: ConfirmedFactForAnalysis[];
  generationRun: InterviewQuestionGenerationRun | null;
  generationCandidates: InterviewQuestionGenerationCandidateRecord[];
  consentRequired: boolean;
}) {
  const commonCount = questions.filter(
    (question) => question.category === "common",
  ).length;
  return (
    <div className="space-y-6">
      <article className="rounded-2xl border-2 border-[var(--ink)] bg-[var(--mist-blue)] p-5 shadow-[3px_3px_0_var(--ink)] sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div>
          <span className="status-chip bg-white">可能问题，不是雇主承诺</span>
          <h2 className="heading-font mt-3 text-2xl font-black">岗位面试准备</h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--ink-muted)]">
            已自动包含 {commonCount} 道通用题；岗位增量题不会复制通用问题，准备记录会回写全局题库。
          </p>
        </div>
        <Link href="/interview" className="button-secondary mt-4 inline-flex min-h-11 items-center px-4 text-sm font-black sm:mt-0">
          打开完整题库 →
        </Link>
      </article>

      <InterviewQuestionGenerationControl
        applicationId={application.id}
        initialRun={generationRun}
        initialCandidates={generationCandidates}
        consentRequired={consentRequired}
        acceptCandidates={acceptInterviewQuestionCandidatesAction.bind(null, {})}
        rejectCandidates={rejectInterviewQuestionCandidatesAction.bind(null, {})}
      />

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <NewInterviewQuestionForm
          applications={[]}
          fixedApplicationId={application.id}
          addQuestion={addInterviewQuestionAction.bind(null, {})}
        />
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--ink-muted)]">Common + job increment</p>
              <h2 className="heading-font mt-1 text-2xl font-black">本岗位准备清单</h2>
            </div>
            <span className="status-chip bg-white">{questions.length} 道</span>
          </div>
          <div className="mt-4 space-y-3">
            {questions.map((question) => (
              <QuestionPreparationCard
                key={question.id}
                question={question}
                applicationId={application.id}
                availableFacts={facts}
                updateQuestion={updateInterviewQuestionAction.bind(null, {})}
                addVariant={addInterviewQuestionVariantAction.bind(null, {})}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const activeTab = detailTab(first(query.tab));
  const application = await applicationRepository.get(user.id, id);
  if (!application) notFound();
  const [events, analysisRun, requirements, resumeAnalysisRun, resumeRequirements, gapData, resumeVersions, resumeAssets, interviewQuestions, interviewFacts, generationData, consentAt] = await Promise.all([
    applicationRepository.listEvents(user.id, id),
    activeTab === "jd"
      ? jdAnalysisRepository.getLatest(user.id, id)
      : Promise.resolve(null),
    activeTab === "jd"
      ? jdAnalysisRepository.listRequirements(user.id, id)
      : Promise.resolve([]),
    activeTab === "resume"
      ? jdAnalysisRepository.getLatestSucceeded(user.id, id)
      : Promise.resolve(null),
    activeTab === "resume"
      ? jdAnalysisRepository.listRequirements(user.id, id)
      : Promise.resolve([]),
    activeTab === "resume"
      ? (async () => {
          const latest = await resumeGapRepository.getLatest(user.id, id);
          const fallback = await resumeGapRepository.getLatestSucceeded(user.id, id);
          const displayRun = latest?.status === "succeeded" ? latest : fallback;
          const items = displayRun ? await resumeGapRepository.listItems(user.id, displayRun.id) : [];
          return { latest, fallback, items };
        })()
      : Promise.resolve({ latest: null, fallback: null, items: [] }),
    activeTab === "resume"
      ? resumeCustomizationRepository.listVersions(user.id, id)
      : Promise.resolve([]),
    activeTab === "resume" ? listAssets(user.id) : Promise.resolve([]),
    activeTab === "interview"
      ? interviewPreparationRepository.listForApplication(user.id, id)
      : Promise.resolve([]),
    activeTab === "interview"
      ? listConfirmedFactsForAnalysis(user.id)
      : Promise.resolve([]),
    activeTab === "interview"
      ? interviewQuestionGenerationRepository.getLatestRun(user.id, id).then(async (run) => ({
          run,
          candidates: run
            ? await interviewQuestionGenerationRepository.listCandidates(user.id, run.id)
            : [],
        }))
      : Promise.resolve({ run: null, candidates: [] }),
    activeTab === "interview"
      ? getAIProcessingConsentAt(user.id)
      : Promise.resolve("not-requested"),
  ]);

  return (
    <section className="min-w-0">
      <Link href="/applications" className="text-xs font-black underline underline-offset-4">
        ← 返回我的投递
      </Link>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="status-chip bg-[var(--cream)]">{APPLICATION_STAGE_LABELS[application.stage]}</span>
            {application.location ? <span className="text-xs font-bold text-[var(--ink-muted)]">{application.location}</span> : null}
          </div>
          <h1 className="heading-font mt-3 break-words text-4xl font-black tracking-[-0.04em] sm:text-5xl">
            {application.roleTitle}
          </h1>
          <p className="mt-2 text-lg font-black text-[var(--ink-muted)]">{application.companyName}</p>
        </div>
        <Link href="/applications/new" className="button-secondary inline-flex min-h-11 items-center justify-center px-4 text-sm font-black">
          ＋ 新建申请
        </Link>
      </div>

      <nav className="mt-7 flex gap-2 overflow-x-auto border-b border-[var(--line)] pb-3" aria-label="申请详情">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={`/applications/${application.id}?tab=${tab}`}
            aria-current={activeTab === tab ? "page" : undefined}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-black ${activeTab === tab ? "border-2 border-[var(--ink)] bg-[var(--cream)] shadow-[2px_2px_0_var(--ink)]" : "border border-[var(--line)] bg-white"}`}
          >
            {tabLabels[tab]}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {activeTab === "overview" ? <Overview application={application} /> : null}
        {activeTab === "jd" ? (
          <JdPanel
            application={application}
            analysisRun={analysisRun}
            requirements={requirements}
          />
        ) : null}
        {activeTab === "timeline" ? <Timeline events={events} /> : null}
        {activeTab === "resume" ? (
          <ResumePanel
            application={application}
            analysisRun={resumeAnalysisRun}
            requirements={resumeRequirements}
            latestGapRun={gapData.latest}
            fallbackGapRun={gapData.fallback}
            gapItems={gapData.items}
            versions={resumeVersions}
            availableAssets={resumeAssets.map((asset) => ({
              id: asset.id,
              originalName: asset.originalName,
              contentType: asset.contentType,
              createdAt: asset.createdAt,
            }))}
            selectedAsset={
              resumeAssets
                .filter((asset) => asset.id === application.resumeSourceAssetId)
                .map((asset) => ({
                  id: asset.id,
                  originalName: asset.originalName,
                  contentType: asset.contentType,
                  createdAt: asset.createdAt,
                }))[0] ?? null
            }
            setupMode={first(query.setup) === "1"}
          />
        ) : null}
        {activeTab === "interview" ? (
          <InterviewPanel
            application={application}
            questions={interviewQuestions}
            facts={interviewFacts}
            generationRun={generationData.run}
            generationCandidates={generationData.candidates}
            consentRequired={!consentAt}
          />
        ) : null}
      </div>
    </section>
  );
}
