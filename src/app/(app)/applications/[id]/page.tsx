import Link from "next/link";
import { notFound } from "next/navigation";

import {
  changeApplicationStageAction,
  deleteApplicationAction,
  setApplicationResumeSourceAction,
} from "@/features/applications/actions";
import { ApplicationDeleteControl } from "@/features/applications/application-delete-control";
import { applicationRepository } from "@/features/applications/repository";
import {
  APPLICATION_STAGE_LABELS,
  WORKPLACE_MODE_LABELS,
  type Application,
  type ApplicationStageEvent,
} from "@/features/applications/schemas";
import { StageUpdateForm } from "@/features/applications/stage-update-form";
import {
  applicationDetailTabs,
  resolveApplicationDetailTab,
} from "@/features/applications/detail-tabs";
import { SetupProgress } from "@/features/applications/setup-progress";
import { jdAnalysisRepository } from "@/features/jd-analysis/repository";
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
import { ResumeJDDifferenceAnalysisControl } from "@/features/resume-jd-difference/analysis-control";
import { ResumeJDDifferencePanel } from "@/features/resume-jd-difference/difference-panel";
import { buildDifferenceFingerprints } from "@/features/resume-jd-difference/hashes";
import { ResumeJDImprovementPanel } from "@/features/resume-jd-difference/improvement-panel";
import {
  RESUME_JD_DIFFERENCE_POLICY_VERSION,
  RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
  differencePromptVariants,
} from "@/features/resume-jd-difference/prompts";
import {
  resumeJDDifferenceRepository,
  type ResumeJDDifferenceRunView,
} from "@/features/resume-jd-difference/repository";
import { resumeCustomizationRepository } from "@/features/resume-customization/repository";
import type {
  ResumeVersion,
} from "@/features/resume-customization/schemas";
import { requireUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env/server";
import { listAssets } from "@/features/source-assets/repository";
import {
  BaselineSelector,
  type ResumeAssetOption,
} from "@/features/resume-gaps/baseline-selector";
import { GapPanel } from "@/features/resume-gaps/gap-panel";
import { getResumeWorkspaceMode, markItemsHistoricalUnlessCurrent, ResumeWorkspace, selectGapRunPair } from "@/features/resume-gaps/resume-workspace";
import { resumeGapRepository } from "@/features/resume-gaps/repository";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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
    <div className="space-y-5">
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
      <aside className="rounded-2xl border border-[#d89a94] bg-white p-5">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#a83c34]">删除投递记录</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--ink-muted)]">
          删除后无法恢复这条投递及其工作区历史，但职业档案和已上传简历会保留。
        </p>
        <div className="mt-4">
          <ApplicationDeleteControl
            applicationId={application.id}
            companyName={application.companyName}
            roleTitle={application.roleTitle}
            redirectAfterDelete
            deleteApplication={deleteApplicationAction.bind(null, {})}
          />
        </div>
      </aside>
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
  return (
    <ResumeWorkspace
      applicationId={application.id}
      mode={getResumeWorkspaceMode({ analysisRunId: analysisRun?.id ?? null, selectedAssetId: selectedAsset?.id ?? null })}
      baselineSelector={<BaselineSelector
        applicationId={application.id}
        selectedAsset={selectedAsset}
        availableAssets={availableAssets}
        setupMode={setupMode}
        setResumeSource={setApplicationResumeSourceAction.bind(null, {})}
      />}
      gapPanel={analysisRun ? (
          <GapPanel
            key={`${selectedAsset?.id ?? "profile"}:${analysisRun.id}`}
            applicationId={application.id}
            baseline={selectedAsset}
            requirements={requirements.map((requirement) => ({
              id: requirement.id,
              text: requirement.text,
              translationZh: requirement.translationZh,
              priority: requirement.priority,
              sortOrder: requirement.sortOrder,
              sourceExcerpt: requirement.sourceExcerpt,
              matchStatus: requirement.matchStatus,
              evidence: requirement.evidence.map((fact) => ({
                id: fact.id,
                title: fact.title,
                description: fact.description,
                sourceExcerpt: fact.sourceExcerpt,
              })),
            }))}
            run={latestGapRun ? {
              status: latestGapRun.status,
              sourceFilename: latestGapRun.sourceFilename,
              sourceAssetId: latestGapRun.sourceAssetId,
              analysisRunId: latestGapRun.analysisRunId,
            } : null}
            fallbackRun={fallbackGapRun ? {
              status: fallbackGapRun.status,
              sourceFilename: fallbackGapRun.sourceFilename,
              sourceAssetId: fallbackGapRun.sourceAssetId,
              analysisRunId: fallbackGapRun.analysisRunId,
            } : null}
            items={gapItems.map((item) => ({
              id: item.id,
              requirementText: item.requirementText,
              translationZh: item.translationZh,
              priority: item.priority,
              sortOrder: item.sortOrder,
              jdSourceExcerpt: item.jdSourceExcerpt,
              resumeCoverage: item.resumeCoverage,
              verifiedResumeExcerpt: item.verifiedResumeExcerpt,
              profileEvidence: item.profileEvidence.map((fact) => ({
                id: fact.id,
                title: fact.title,
                description: fact.description,
                sourceExcerpt: fact.sourceExcerpt,
              })),
              matchStatus: item.matchStatus,
              historical: item.historical,
            }))}
            currentAnalysisRunId={analysisRun.id}
          />
      ) : null}
      versions={versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        template: version.template,
        itemCount: version.items.length,
        createdAt: version.createdAt,
      }))}
    />
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
  const activeTab = resolveApplicationDetailTab(first(query.tab));
  const application = await applicationRepository.get(user.id, id);
  if (!application) notFound();
  const differenceWorkflow =
    activeTab === "difference" || activeTab === "improvements";
  const [
    events,
    resumeAnalysisRun,
    gapData,
    resumeVersions,
    resumeAssets,
    interviewQuestions,
    interviewFacts,
    generationData,
    consentAt,
    differenceFacts,
  ] = await Promise.all([
    applicationRepository.listEvents(user.id, id),
    activeTab === "resume"
      ? jdAnalysisRepository.getLatestSucceeded(user.id, id)
      : Promise.resolve(null),
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
    activeTab === "resume" || differenceWorkflow
      ? listAssets(user.id)
      : Promise.resolve([]),
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
    differenceWorkflow && application.resumeSourceAssetId
      ? listConfirmedFactsForAnalysis(user.id)
      : Promise.resolve([]),
  ]);

  const selectedResumeAssetRecord =
    resumeAssets.find((asset) => asset.id === application.resumeSourceAssetId) ??
    null;
  const selectedResumeAsset = selectedResumeAssetRecord
    ? {
        id: selectedResumeAssetRecord.id,
        originalName: selectedResumeAssetRecord.originalName,
        contentType: selectedResumeAssetRecord.contentType,
        createdAt: selectedResumeAssetRecord.createdAt,
      }
    : null;
  const resumeRequirementsForRun = activeTab === "resume" && resumeAnalysisRun
    ? await jdAnalysisRepository.listRequirements(user.id, id, resumeAnalysisRun.id)
    : [];
  let currentGapData = gapData;
  if (activeTab === "resume" && application.resumeSourceAssetId && resumeAnalysisRun) {
    const exactLatest = await resumeGapRepository.getLatestForCombination(user.id, id, application.resumeSourceAssetId, resumeAnalysisRun.id);
    const exactSucceeded = exactLatest?.status === "succeeded"
      ? exactLatest
      : await resumeGapRepository.getLatestForCombination(user.id, id, application.resumeSourceAssetId, resumeAnalysisRun.id, true);
    const selectedGapRuns = selectGapRunPair(exactLatest, exactSucceeded, gapData.latest, gapData.fallback);
    const itemRun = selectedGapRuns.latest?.status === "succeeded"
      ? selectedGapRuns.latest
      : selectedGapRuns.fallback?.status === "succeeded"
        ? selectedGapRuns.fallback
        : null;
    const items = itemRun ? await resumeGapRepository.listItems(user.id, itemRun.id) : [];
    currentGapData = {
      ...selectedGapRuns,
      items: markItemsHistoricalUnlessCurrent(
        items,
        itemRun,
        application.resumeSourceAssetId,
        resumeAnalysisRun.id,
      ),
    };
  }

  let differenceView: ResumeJDDifferenceRunView = {
    current: null,
    previousSucceeded: null,
    freshness: "missing",
  };
  if (differenceWorkflow && selectedResumeAssetRecord) {
    const env = getServerEnv();
    const providerConfig =
      env.E2E_FAKE_EXTRACTOR === "1" && process.env.NODE_ENV !== "production"
        ? { provider: "fake", model: "fake-resume-jd-difference-v4" }
        : { provider: env.AI_TEXT_PROVIDER, model: env.AI_TEXT_MODEL };
    const prompt =
      differencePromptVariants[env.RESUME_JD_DIFFERENCE_PROMPT_VARIANT];
    const { inputHash } = buildDifferenceFingerprints({
      jdText: application.jdText,
      sourceSha256: selectedResumeAssetRecord.sha256,
      confirmedFacts: differenceFacts,
      ...providerConfig,
      promptVersion: prompt.version,
      schemaVersion: RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
      policyVersion: RESUME_JD_DIFFERENCE_POLICY_VERSION,
    });
    differenceView = await resumeJDDifferenceRepository.getView(
      user.id,
      application.id,
      inputHash,
    );
  }

  const displayedDifferenceRun =
    first(query.result) === "previous"
      ? differenceView.previousSucceeded
      : differenceView.current;

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
        <Link href="/applications/new" className="button-secondary hidden min-h-11 items-center justify-center px-4 text-sm font-black md:inline-flex">
          ＋ 新建申请
        </Link>
      </div>

      <nav className="mt-7 flex gap-2 overflow-x-auto border-b border-[var(--line)] pb-3" aria-label="申请详情">
        {applicationDetailTabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/applications/${application.id}?tab=${tab.id}`}
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-black ${activeTab === tab.id ? "border-2 border-[var(--ink)] bg-[var(--cream)] shadow-[2px_2px_0_var(--ink)]" : "border border-[var(--line)] bg-white"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {activeTab === "overview" ? <Overview application={application} /> : null}
        {activeTab === "timeline" ? <Timeline events={events} /> : null}
        {activeTab === "resume" ? (
          <div className="space-y-6">
            {first(query.setup) === "1" ? <SetupProgress current="resume" /> : null}
            <ResumePanel
              application={application}
              analysisRun={resumeAnalysisRun}
              requirements={resumeRequirementsForRun}
              latestGapRun={currentGapData.latest}
              fallbackGapRun={currentGapData.fallback}
              gapItems={currentGapData.items}
              versions={resumeVersions}
              availableAssets={resumeAssets.map((asset) => ({
                id: asset.id,
                originalName: asset.originalName,
                contentType: asset.contentType,
                createdAt: asset.createdAt,
              }))}
              selectedAsset={selectedResumeAsset}
              setupMode={first(query.setup) === "1"}
            />
          </div>
        ) : null}
        {activeTab === "difference" ? (
          <div className="space-y-7">
            {first(query.setup) === "1" ? <SetupProgress current="gap" /> : null}
            <header>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                Resume × job description
              </p>
              <h2 className="heading-font mt-1 text-3xl font-black sm:text-4xl">
                岗位与简历差异分析
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--ink-muted)]">
                找出这份简历尚未覆盖、表达不清或无法证明的岗位重点。
              </p>
            </header>
            <ResumeJDDifferenceAnalysisControl
              applicationId={application.id}
              asset={selectedResumeAsset}
              initialRun={differenceView.current ? {
                status: differenceView.current.status,
                errorCode: differenceView.current.errorCode,
              } : null}
              freshness={differenceView.freshness}
              hasPreviousResult={Boolean(differenceView.previousSucceeded)}
            />
            <ResumeJDDifferencePanel
              applicationId={application.id}
              run={displayedDifferenceRun}
            />
          </div>
        ) : null}
        {activeTab === "improvements" ? (
          <ResumeJDImprovementPanel
            applicationId={application.id}
            run={differenceView.current}
            freshness={differenceView.freshness}
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
