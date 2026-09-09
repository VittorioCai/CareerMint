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
import { requireUser } from "@/lib/auth/require-user";
import { getServerEnv } from "@/lib/env/server";
import { listAssets } from "@/features/source-assets/repository";
import {
  BaselineSelector,
  type ResumeAssetOption,
  type ResumeAssetRow,
} from "@/features/resume-baseline/baseline-selector";
import { summarizeAssetUsage } from "@/features/resume-baseline/asset-usage";
import { careerFactRepository } from "@/features/career-profile/repository";
import { getResumeWorkspaceMode, ResumeWorkspace } from "@/features/resume-baseline/resume-workspace";

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
        {/* Six one-line values do not need six bordered cards: as a grid of
            articles they stretched to a uniform height and took 450px to say
            what fits in a third of that. This is a description list, so it is
            marked up as one. */}
        <dl className="dense-surface grid self-start sm:grid-cols-2 sm:divide-x sm:divide-[var(--line)]">
          {[
            ["当前阶段", APPLICATION_STAGE_LABELS[application.stage]],
            ["阶段开始", formatDate(application.stageChangedAt)],
            ["首次投递", formatDate(application.appliedAt)],
            ["办公方式", WORKPLACE_MODE_LABELS[application.workplaceMode]],
            ["来源", application.source ?? "未填写"],
            ["下一步", application.nextAction ?? "尚未设置"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] px-4 py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0"
            >
              <dt className="shrink-0 type-eyebrow text-[var(--ink-muted)]">
                {label}
              </dt>
              <dd className="min-w-0 break-words text-right text-sm font-semibold">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <aside className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em]">更新进度</p>
        <h2 className="heading-font mt-2 text-xl font-semibold">发生了什么？记下来</h2>
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
      <aside className="rounded-2xl border border-[var(--danger-line)] bg-[var(--paper)] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--danger)]">删除投递记录</p>
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
        <li key={event.id} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4 sm:grid-cols-[150px_minmax(0,1fr)]">
          <time className="text-xs font-semibold text-[var(--ink-muted)]" dateTime={event.occurredAt}>
            {formatDate(event.occurredAt)}
          </time>
          <div>
            <p className="text-sm font-semibold">
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
  selectedAsset,
  availableAssets,
  setupMode,
}: {
  application: Application;
  selectedAsset: ResumeAssetOption | null;
  availableAssets: ResumeAssetRow[];
  setupMode: boolean;
}) {
  return (
    <ResumeWorkspace
      applicationId={application.id}
      mode={getResumeWorkspaceMode({ selectedAssetId: selectedAsset?.id ?? null })}
      baselineSelector={<BaselineSelector
        applicationId={application.id}
        selectedAsset={selectedAsset}
        availableAssets={availableAssets}
        setupMode={setupMode}
        setResumeSource={setApplicationResumeSourceAction.bind(null, {})}
      />}
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
      <article className="soft-surface p-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div>
          <span className="status-chip bg-[var(--paper)]">可能问题，不是雇主承诺</span>
          <h2 className="heading-font mt-3 text-2xl font-bold">岗位面试准备</h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--ink-muted)]">
            已自动包含 {commonCount} 道通用题；岗位增量题不会复制通用问题，准备记录会回写全局题库。
          </p>
        </div>
        <Link href="/interview" className="button-secondary mt-4 inline-flex min-h-11 items-center px-4 text-sm font-semibold sm:mt-0">
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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">Common + job increment</p>
              <h2 className="heading-font mt-1 text-2xl font-bold">本岗位准备清单</h2>
            </div>
            <span className="status-chip bg-[var(--paper)]">{questions.length} 道</span>
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
    resumeAssets,
    interviewQuestions,
    interviewFacts,
    generationData,
    consentAt,
    differenceFacts,
    assetUsageApplications,
    assetUsageFacts,
  ] = await Promise.all([
    applicationRepository.listEvents(user.id, id),
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
    // Only the resume tab shows the delete confirmation, and it has to state
    // what the file is used for before the user commits.
    activeTab === "resume"
      ? applicationRepository.list(user.id)
      : Promise.resolve([]),
    activeTab === "resume"
      ? careerFactRepository.list(user.id)
      : Promise.resolve([]),
  ]);
  const assetUsage = summarizeAssetUsage({
    applications: assetUsageApplications,
    facts: assetUsageFacts,
  });

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
  let differenceView: ResumeJDDifferenceRunView = {
    current: null,
    previousSucceeded: null,
    freshness: "missing",
  };
  if (differenceWorkflow) {
    let inputHash = "";
    if (selectedResumeAssetRecord) {
      const env = getServerEnv();
      const providerConfig =
        env.E2E_FAKE_EXTRACTOR === "1" && process.env.NODE_ENV !== "production"
          ? { provider: "fake", model: "fake-resume-jd-difference-v4" }
          : { provider: env.AI_TEXT_PROVIDER, model: env.AI_TEXT_MODEL };
      const prompt =
        differencePromptVariants[env.RESUME_JD_DIFFERENCE_PROMPT_VARIANT];
      ({ inputHash } = buildDifferenceFingerprints({
        jdText: application.jdText,
        sourceSha256: selectedResumeAssetRecord.sha256,
        confirmedFacts: differenceFacts,
        ...providerConfig,
        promptVersion: prompt.version,
        schemaVersion: RESUME_JD_DIFFERENCE_SCHEMA_VERSION,
        policyVersion: RESUME_JD_DIFFERENCE_POLICY_VERSION,
      }));
    }
    // Without a baseline there is no hash to be current against, but the runs
    // are still the user's work: `input_hash` is constrained to 64 hex chars,
    // so "" matches nothing and the last success comes back marked stale
    // rather than disappearing with the file it was run against.
    differenceView = await resumeJDDifferenceRepository.getView(
      user.id,
      application.id,
      inputHash,
    );
  }

  const showingPreviousDifference =
    first(query.result) === "previous" || !selectedResumeAssetRecord;
  const displayedDifferenceRun = showingPreviousDifference
    ? differenceView.previousSucceeded
    : differenceView.current;

  return (
    <section className="min-w-0">
      <Link href="/applications" className="text-xs font-semibold underline underline-offset-4">
        ← 返回我的投递
      </Link>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="status-chip bg-[var(--surface-muted)]">{APPLICATION_STAGE_LABELS[application.stage]}</span>
            {application.location ? <span className="text-xs font-bold text-[var(--ink-muted)]">{application.location}</span> : null}
          </div>
          <h1
            className={`heading-font mt-3 break-words font-semibold ${
              differenceWorkflow ? "text-xl sm:text-2xl" : "type-page-title"
            }`}
          >
            {application.roleTitle}
          </h1>
          <p className="mt-1.5 text-base font-semibold text-[var(--ink-muted)]">{application.companyName}</p>
        </div>
      </div>

      <nav className="mt-7 flex w-fit flex-wrap gap-1 rounded-[10px] bg-[var(--surface-muted)] p-1" aria-label="申请详情">
        {applicationDetailTabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/applications/${application.id}?tab=${tab.id}`}
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3.5 py-1.5 text-sm transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out)] ${activeTab === tab.id ? "bg-[var(--paper)] font-semibold shadow-[var(--elevation-1)]" : "font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
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
              availableAssets={resumeAssets.map((asset) => ({
                id: asset.id,
                originalName: asset.originalName,
                contentType: asset.contentType,
                createdAt: asset.createdAt,
                status: asset.status,
                applicationCount: assetUsage.get(asset.id)?.applicationCount ?? 0,
                confirmedFactCount:
                  assetUsage.get(asset.id)?.confirmedFactCount ?? 0,
              }))}
              selectedAsset={selectedResumeAsset}
              setupMode={first(query.setup) === "1"}
            />
          </div>
        ) : null}
        {activeTab === "difference" ? (
          <div className="max-w-[1040px] space-y-7">
            <ResumeJDDifferencePanel
              applicationId={application.id}
              run={displayedDifferenceRun}
              facts={differenceFacts}
              stale={showingPreviousDifference}
              control={
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
              }
            />
          </div>
        ) : null}
        {activeTab === "improvements" ? (
          <ResumeJDImprovementPanel
            applicationId={application.id}
            run={differenceView.current}
            facts={differenceFacts}
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
