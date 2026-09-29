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
import { listConfirmedFactsForAnalysis } from "@/features/career-profile/repository";
import type { ConfirmedFactForAnalysis } from "@/features/career-profile/confirmed-facts";
import { getAIProcessingConsentAt } from "@/features/account/repository";
import { ResumeJDDifferenceAnalysisControl } from "@/features/resume-jd-difference/analysis-control";
import { ResumeJDDifferencePanel } from "@/features/resume-jd-difference/difference-panel";
import {
  applicationNextStep,
  type ApplicationNextStep,
} from "@/features/applications/next-step";
import { NextStepCard } from "@/features/applications/next-step-card";
import { currentDifferenceInputs } from "@/features/resume-jd-difference/current-input";
import { ResumeJDImprovementPanel } from "@/features/resume-jd-difference/improvement-panel";
import {
  resumeJDDifferenceRepository,
  type ResumeJDDifferenceRunView,
} from "@/features/resume-jd-difference/repository";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { formatDay } from "@/i18n/format";
import type { AppLocale } from "@/i18n/locale";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/require-user";
import { listAssets } from "@/features/source-assets/repository";
import {
  BaselineSelector,
  type ResumeAssetOption,
  type ResumeAssetRow,
} from "@/features/resume-baseline/baseline-selector";
import { summarizeAssetUsage } from "@/features/resume-baseline/asset-usage";
import { careerFactRepository } from "@/features/career-profile/repository";
import { getResumeWorkspaceMode, ResumeWorkspace } from "@/features/resume-baseline/resume-workspace";
import { LinkPending } from "@/components/link-pending";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null, locale: AppLocale) {
  if (!value) return null;
  return formatDay(value, locale, "long");
}

/** Only a link the browser will treat as one to a web page. */
function webUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function Overview({
  application,
  nextStep,
  appsCopy,
  locale,
  common,
  detail,
}: {
  application: Application;
  nextStep: ApplicationNextStep | null;
  appsCopy: Dictionary["applications"];
  locale: AppLocale;
  common: Dictionary["common"];
  detail: Dictionary["detail"];
}) {
  const jobUrl = webUrl(application.jobUrl);

  return (
    <div className="space-y-5">
      {nextStep ? (
        <NextStepCard
          application={application}
          step={nextStep}
          copy={appsCopy.nextStep}
        />
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Six one-line values do not need six bordered cards: as a grid of
            articles they stretched to a uniform height and took 450px to say
            what fits in a third of that. This is a description list, so it is
            marked up as one. */}
        <dl className="dense-surface grid self-start sm:grid-cols-2 sm:divide-x sm:divide-[var(--line)]">
          {/* A row appears when there is a value for it. 来源：未填写 is a
              row that costs a line to report an absence the reader can see
              from the row not being there. */}
          {(
            [
              [detail.fields.currentStage, appsCopy.stages[application.stage]],
              [detail.fields.stageSince, formatDate(application.stageChangedAt, locale)],
              [detail.fields.appliedAt, formatDate(application.appliedAt, locale)],
              [
                detail.fields.workplaceMode,
                application.workplaceMode === "unspecified"
                  ? null
                  : appsCopy.workplaceModes[application.workplaceMode],
              ],
              [detail.fields.source, application.source],
              [detail.fields.nextAction, application.nextAction],
            ] satisfies [string, string | null][]
          )
            .filter((entry): entry is [string, string] => Boolean(entry[1]))
            .map(([label, value]) => (
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
        <p className="text-xs font-semibold uppercase tracking-[0.12em]">{detail.updateEyebrow}</p>
        <h2 className="heading-font mt-2 text-xl font-semibold">{detail.updateTitle}</h2>
        <p className="mt-2 text-xs font-semibold leading-5 text-[var(--ink-muted)]">
          {detail.updateBody}
        </p>
        <div className="mt-4 border-t border-[color:var(--ink-soft)] pt-4">
          <StageUpdateForm
            copy={appsCopy}
            applicationId={application.id}
            currentStage={application.stage}
            changeStage={changeApplicationStageAction.bind(null, {})}
          />
        </div>
        </aside>
      </div>
      {/* The text everything else on this application is measured against.
          It was pasted in once and then shown nowhere: the only way to read
          it again was a sentence at a time, as quotations inside the
          analysis. Closed by default — it can be a hundred thousand
          characters. */}
      <details className="reveal group dense-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{detail.jdTitle}</span>
            <span className="mt-0.5 block text-xs font-medium text-[var(--ink-muted)]">
              {detail.jdLength.replace(
                "{count}",
                application.jdText.length.toLocaleString(locale),
              )}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center text-[var(--ink-muted)] transition-transform group-open:rotate-180"
          >
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 8l5 5 5-5" />
            </svg>
          </span>
        </summary>
        <div className="border-t border-[var(--line)] px-4 py-4">
          {jobUrl ? (
            <a
              href={jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-action mb-3 text-sm font-semibold underline decoration-[var(--ink-soft)] underline-offset-4 hover:decoration-[var(--ink)]"
            >
              {detail.jobLink} <span aria-hidden="true">↗</span>
            </a>
          ) : null}
          {/* The posting's own language, which the page does not know. */}
          <p lang="und" className="foreign whitespace-pre-wrap type-body">
            {application.jdText}
          </p>
        </div>
      </details>
      <aside className="rounded-2xl border border-[var(--danger-line)] bg-[var(--paper)] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--danger)]">{detail.deleteEyebrow}</p>
        <p className="mt-2 type-caption text-[var(--ink-muted)]">
          {detail.deleteBody}
        </p>
        <div className="mt-4">
          <ApplicationDeleteControl
            copy={appsCopy}
            common={common}
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

function Timeline({
  events,
  appsCopy,
  locale,
}: {
  events: ApplicationStageEvent[];
  appsCopy: Dictionary["applications"];
  locale: AppLocale;
}) {
  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="grid gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4 sm:grid-cols-[150px_minmax(0,1fr)]">
          <time className="text-xs font-semibold text-[var(--ink-muted)]" dateTime={event.occurredAt}>
            {formatDate(event.occurredAt, locale)}
          </time>
          <div>
            <p className="text-sm font-semibold">
              {event.fromStage
                ? `${appsCopy.stages[event.fromStage]} → ${appsCopy.stages[event.toStage]}`
                : appsCopy.createdEvent.replace(
                    "{stage}",
                    appsCopy.stages[event.toStage],
                  )}
            </p>
            {event.note ? (
              <p className="mt-1 type-caption text-[var(--ink-muted)]">{event.note}</p>
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
  resume,
  common,
  locale,
}: {
  application: Application;
  selectedAsset: ResumeAssetOption | null;
  availableAssets: ResumeAssetRow[];
  setupMode: boolean;
  resume: Dictionary["resume"];
  common: Dictionary["common"];
  locale: AppLocale;
}) {
  return (
    <ResumeWorkspace
      copy={resume}
      applicationId={application.id}
      mode={getResumeWorkspaceMode({ selectedAssetId: selectedAsset?.id ?? null })}
      baselineSelector={<BaselineSelector
        copy={resume}
        common={common}
        locale={locale}
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
  detail,
  interview,
}: {
  application: Application;
  questions: InterviewQuestion[];
  facts: ConfirmedFactForAnalysis[];
  generationRun: InterviewQuestionGenerationRun | null;
  generationCandidates: InterviewQuestionGenerationCandidateRecord[];
  consentRequired: boolean;
  detail: Dictionary["detail"];
  interview: Dictionary["interview"];
}) {
  const commonCount = questions.filter(
    (question) => question.category === "common",
  ).length;
  return (
    <div className="space-y-6">
      <article className="soft-surface p-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div>
          <span className="status-chip bg-[var(--paper)]">{detail.interviewChip}</span>
          <h2 className="heading-font mt-3 text-2xl font-bold">{detail.interviewTitle}</h2>
          <p className="mt-2 type-caption text-[var(--ink-muted)]">
            {detail.interviewBody.replace("{count}", String(commonCount))}
          </p>
        </div>
        <Link href="/interview" className="button-secondary mt-4 inline-flex min-h-11 items-center px-4 text-sm font-semibold sm:mt-0">
          {detail.openLibrary}
        </Link>
      </article>

      <InterviewQuestionGenerationControl
        copy={interview}
        applicationId={application.id}
        initialRun={generationRun}
        initialCandidates={generationCandidates}
        consentRequired={consentRequired}
        acceptCandidates={acceptInterviewQuestionCandidatesAction.bind(null, {})}
        rejectCandidates={rejectInterviewQuestionCandidatesAction.bind(null, {})}
      />

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <NewInterviewQuestionForm
          copy={interview}
          applications={[]}
          fixedApplicationId={application.id}
          addQuestion={addInterviewQuestionAction.bind(null, {})}
        />
        <section>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">{detail.checklistEyebrow}</p>
              <h2 className="heading-font mt-1 text-2xl font-bold">{detail.checklistTitle}</h2>
            </div>
            <span className="status-chip bg-[var(--paper)]">{questions.length} {interview.countSuffix}</span>
          </div>
          <div className="mt-4 space-y-3">
            {questions.map((question) => (
              <QuestionPreparationCard
                copy={interview}
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
  const {
    applications: appsCopy,
    common,
    difference,
    improvements,
    detail,
    interview,
    resume,
  } = await getDictionary();
  const locale = await getLocale();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const activeTab = resolveApplicationDetailTab(first(query.tab));
  const application = await applicationRepository.get(user.id, id);
  if (!application) notFound();
  const differenceWorkflow =
    activeTab === "difference" || activeTab === "improvements";
  const [
    analysed,
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
    // For the overview's next step. A convenience: if it cannot be read the
    // page says the analysis is still to do, which is the safe way to be
    // wrong.
    activeTab === "overview"
      ? resumeJDDifferenceRepository
          .getLatestSucceeded(user.id, id)
          .then(Boolean)
          .catch(() => false)
      : Promise.resolve(false),
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
    activeTab === "interview" || activeTab === "difference"
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
    // Same prompt, same language: this asks whether the analysis that would
    // run right now is the one that is stored, so a reader who switched
    // languages sees the stored analysis marked out of date rather than under
    // headings that do not match its text.
    //
    // Without a baseline there is nothing to be current against, but the runs
    // are still the user's work: nothing matches, and the last success comes
    // back marked stale rather than disappearing with the file it was run
    // against.
    differenceView = await resumeJDDifferenceRepository.getView(
      user.id,
      application.id,
      selectedResumeAssetRecord
        ? currentDifferenceInputs({
            applicationId: application.id,
            jdText: application.jdText,
            sourceSha256: selectedResumeAssetRecord.sha256,
            confirmedFacts: differenceFacts,
            locale,
          })
        : () => false,
    );
  }

  // A finished analysis stays on screen when there is no run for the current
  // inputs. Before, any change — including switching language — replaced it
  // with an empty page whose only route back was a link the control rendered
  // solely while busy or failed, which a language switch is neither.
  const showingPreviousDifference =
    first(query.result) === "previous" ||
    !selectedResumeAssetRecord ||
    (!differenceView.current && Boolean(differenceView.previousSucceeded));
  const displayedDifferenceRun = showingPreviousDifference
    ? differenceView.previousSucceeded
    : differenceView.current;

  return (
    <section className="min-w-0">
      <Link href="/applications" className="text-xs font-semibold underline underline-offset-4">
        {detail.backToApplications}
      </Link>
      <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="status-chip bg-[var(--surface-muted)]">{appsCopy.stages[application.stage]}</span>
            {application.location ? <span className="text-xs font-bold text-[var(--ink-muted)]">{application.location}</span> : null}
          </div>
          <h1
            className={`heading-font mt-3 break-words ${
              differenceWorkflow ? "text-xl font-semibold sm:text-2xl" : "type-page-title"
            }`}
          >
            {application.roleTitle}
          </h1>
          <p className="mt-1.5 text-base font-semibold text-[var(--ink-muted)]">{application.companyName}</p>
        </div>
      </div>

      <nav className="mt-7 flex w-fit flex-wrap gap-1 rounded-[10px] bg-[var(--surface-muted)] p-1" aria-label={detail.tabsLabel}>
        {applicationDetailTabs.map((tab) => (
          <Link
            key={tab}
            href={`/applications/${application.id}?tab=${tab}`}
            aria-current={activeTab === tab ? "page" : undefined}
            className={`segment shrink-0 gap-1.5 ${activeTab === tab ? "bg-[var(--paper)] font-semibold shadow-[var(--elevation-1)]" : "font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"}`}
          >
            {detail.tabs[tab]}
            <LinkPending />
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {activeTab === "overview" ? <Overview
              application={application}
              nextStep={applicationNextStep(application, analysed)}
              appsCopy={appsCopy}
              common={common}
              detail={detail}
              locale={locale}
            /> : null}
        {activeTab === "timeline" ? <Timeline events={events} appsCopy={appsCopy} locale={locale} /> : null}
        {activeTab === "resume" ? (
          <div className="space-y-6">
            {first(query.setup) === "1" ? <SetupProgress current="resume" copy={appsCopy.setup} /> : null}
            <ResumePanel
              resume={resume}
              common={common}
              locale={locale}
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
            {/* The progress used to stop at the resume step: the reader was
                told they were on step two of four, chose a resume, and the
                steps were gone. */}
            {first(query.setup) === "1" ? (
              <SetupProgress
                current={
                  differenceView.current?.status === "succeeded" ? "gap" : "jd"
                }
                copy={appsCopy.setup}
              />
            ) : null}
            <ResumeJDDifferencePanel
              copy={difference}
              applicationId={application.id}
              run={displayedDifferenceRun}
              readerLocale={locale}
              facts={differenceFacts}
              stale={showingPreviousDifference}
              control={
                <ResumeJDDifferenceAnalysisControl
                  applicationId={application.id}
                  copy={difference.control}
                  common={common}
                  asset={selectedResumeAsset}
                  initialRun={differenceView.current ? {
                    status: differenceView.current.status,
                    errorCode: differenceView.current.errorCode,
                  } : null}
                  freshness={differenceView.freshness}
                  hasPreviousResult={Boolean(differenceView.previousSucceeded)}
                  consentRequired={!consentAt}
                />
              }
            />
          </div>
        ) : null}
        {activeTab === "improvements" ? (
          <ResumeJDImprovementPanel
            copy={improvements}
            applicationId={application.id}
            run={differenceView.current}
            previous={differenceView.previousSucceeded}
            readerLocale={locale}
            facts={differenceFacts}
            freshness={differenceView.freshness}
          />
        ) : null}
        {activeTab === "interview" ? (
          <InterviewPanel
            detail={detail}
            interview={interview}
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
