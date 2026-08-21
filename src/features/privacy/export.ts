import JSZip from "jszip";

type OwnedRecord = { userId: string };
type OwnedApplication = OwnedRecord & { id: string };
type ApplicationChildRecord = { applicationId: string };
type InterviewExportRecord = OwnedRecord & {
  applicationLinks?: ApplicationChildRecord[];
};
type InterviewGenerationRunExportRecord = OwnedRecord & {
  id: string;
  applicationId: string;
  schemaVersion: string;
  provider: string;
  model: string;
  status: string;
  attemptCount: number;
  result: unknown;
  errorCode?: string | null;
  requestId?: string | null;
  createdAt: string;
  updatedAt: string;
};
type InterviewGenerationCandidateExportRecord = {
  userId: string;
  id: string;
  runId: string;
  applicationId: string;
  category: string;
  prompt: string;
  canonicalKey?: string | null;
  sourceExcerpt: string;
  relevanceReason: string;
  status: string;
  questionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
type ExportAsset = OwnedRecord & {
  id: string;
  originalName: string;
  contentType?: string;
  storagePath: string;
  sizeBytes?: number;
  sha256?: string;
  status?: string;
  createdAt?: string;
};

export type AccountExportDependencies = {
  getProfile(userId: string): Promise<OwnedRecord | null>;
  listFacts(userId: string): Promise<OwnedRecord[]>;
  listAssets(userId: string): Promise<ExportAsset[]>;
  listApplications(userId: string): Promise<OwnedApplication[]>;
  listApplicationEvents(
    userId: string,
    applicationId: string,
  ): Promise<Array<OwnedRecord & ApplicationChildRecord>>;
  listAnalysisRuns(
    userId: string,
  ): Promise<Array<OwnedRecord & ApplicationChildRecord>>;
  listRequirements(
    userId: string,
    applicationId: string,
  ): Promise<ApplicationChildRecord[]>;
  listResumeRuns(
    userId: string,
  ): Promise<Array<OwnedRecord & ApplicationChildRecord & { id: string }>>;
  listResumeSuggestions(
    userId: string,
    runId: string,
  ): Promise<ApplicationChildRecord[]>;
  listResumeVersions(
    userId: string,
    applicationId: string,
  ): Promise<Array<OwnedRecord & ApplicationChildRecord>>;
  listInterviewQuestions(userId: string): Promise<InterviewExportRecord[]>;
  listInterviewGenerationRuns(
    userId: string,
  ): Promise<InterviewGenerationRunExportRecord[]>;
  listInterviewGenerationCandidates(
    userId: string,
  ): Promise<InterviewGenerationCandidateExportRecord[]>;
  download(storagePath: string): Promise<Blob>;
};

function safeFilename(originalName: string) {
  const basename = originalName.replaceAll("\\", "/").split("/").pop() ?? "";
  const sanitized = basename
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "-")
    .trim();
  return sanitized || "source-file";
}

function publicAssetMetadata(asset: ExportAsset) {
  return {
    id: asset.id,
    originalName: asset.originalName,
    contentType: asset.contentType ?? null,
    sizeBytes: asset.sizeBytes ?? null,
    sha256: asset.sha256 ?? null,
    status: asset.status ?? null,
    createdAt: asset.createdAt ?? null,
  };
}

function safeRequestId(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{1,200}$/.test(trimmed) ? trimmed : null;
}

function safeErrorCode(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[a-z0-9][a-z0-9-]{0,99}$/.test(trimmed) ? trimmed : null;
}

function safeRunResult(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  const ai = result.ai;
  const usage = ai && typeof ai === "object"
    ? (ai as Record<string, unknown>).usage
    : null;
  const aiRecord = ai && typeof ai === "object" ? (ai as Record<string, unknown>) : null;
  const usageRecord = usage && typeof usage === "object"
    ? (usage as Record<string, unknown>)
    : null;
  const estimatedCost = result.estimatedCost;
  const costRecord = estimatedCost && typeof estimatedCost === "object"
    ? (estimatedCost as Record<string, unknown>)
    : null;
  if (!aiRecord || !usageRecord) return null;
  if (
    typeof result.acceptedCandidateCount !== "number" ||
    typeof result.rejectedCandidateCount !== "number" ||
    typeof result.pendingCandidateCount !== "number" ||
    typeof aiRecord.provider !== "string" ||
    typeof aiRecord.model !== "string" ||
    typeof usageRecord.inputCacheHitTokens !== "number" ||
    typeof usageRecord.inputCacheMissTokens !== "number" ||
    typeof usageRecord.outputTokens !== "number"
  ) {
    return null;
  }
  return {
    acceptedCandidateCount: result.acceptedCandidateCount,
    rejectedCandidateCount: result.rejectedCandidateCount,
    pendingCandidateCount: result.pendingCandidateCount,
    ai: {
      provider: aiRecord.provider,
      model: aiRecord.model,
      requestId: safeRequestId(aiRecord.requestId),
      usage: {
        inputCacheHitTokens: usageRecord.inputCacheHitTokens,
        inputCacheMissTokens: usageRecord.inputCacheMissTokens,
        outputTokens: usageRecord.outputTokens,
      },
      priceScheduleVersion:
        typeof aiRecord.priceScheduleVersion === "string"
          ? aiRecord.priceScheduleVersion
          : null,
    },
    estimatedCost:
      costRecord &&
      typeof costRecord.amount === "number" &&
      costRecord.currency === "USD" &&
      typeof costRecord.scheduleVersion === "string" &&
      (costRecord.tier === "default" || costRecord.tier === "peak")
        ? {
            amount: costRecord.amount,
            currency: "USD" as const,
            scheduleVersion: costRecord.scheduleVersion,
            tier: costRecord.tier,
          }
        : null,
  };
}

function publicInterviewGenerationRun(
  run: InterviewGenerationRunExportRecord,
) {
  return {
    id: run.id,
    applicationId: run.applicationId,
    schemaVersion: run.schemaVersion,
    provider: run.provider,
    model: run.model,
    status: run.status,
    attemptCount: run.attemptCount,
    result: safeRunResult(run.result),
    errorCode: safeErrorCode(run.errorCode),
    requestId: safeRequestId(run.requestId),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function publicInterviewGenerationCandidate(
  candidate: InterviewGenerationCandidateExportRecord,
) {
  return {
    id: candidate.id,
    runId: candidate.runId,
    applicationId: candidate.applicationId,
    category: candidate.category,
    prompt: candidate.prompt,
    canonicalKey: candidate.canonicalKey ?? null,
    sourceExcerpt: candidate.sourceExcerpt,
    relevanceReason: candidate.relevanceReason,
    status: candidate.status,
    questionId: candidate.questionId ?? null,
    createdAt: candidate.createdAt ?? null,
    reviewedAt:
      candidate.status === "pending"
        ? null
        : candidate.updatedAt ?? candidate.createdAt ?? null,
  };
}

export async function buildAccountExport(
  userId: string,
  dependencies: AccountExportDependencies,
): Promise<Buffer> {
  const [
    profile,
    allFacts,
    allAssets,
    allApplications,
    allAnalysisRuns,
    allResumeRuns,
    allInterviewQuestions,
    allInterviewGenerationRuns,
    allInterviewGenerationCandidates,
  ] =
    await Promise.all([
    dependencies.getProfile(userId),
    dependencies.listFacts(userId),
    dependencies.listAssets(userId),
      dependencies.listApplications(userId),
      dependencies.listAnalysisRuns(userId),
      dependencies.listResumeRuns(userId),
      dependencies.listInterviewQuestions(userId),
      dependencies.listInterviewGenerationRuns(userId),
      dependencies.listInterviewGenerationCandidates(userId),
    ]);
  const ownedProfile = profile?.userId === userId ? profile : null;
  const facts = allFacts.filter((fact) => fact.userId === userId);
  const assets = allAssets.filter((asset) => asset.userId === userId);
  const applications = allApplications.filter(
    (application) => application.userId === userId,
  );
  const applicationIds = new Set(
    applications.map((application) => application.id),
  );
  const analysisRuns = allAnalysisRuns.filter(
    (run) => run.userId === userId && applicationIds.has(run.applicationId),
  );
  const resumeRuns = allResumeRuns.filter(
    (run) => run.userId === userId && applicationIds.has(run.applicationId),
  );
  const interviewQuestions = allInterviewQuestions
    .filter((question) => question.userId === userId)
    .map((question) => ({
      ...question,
      applicationLinks: (question.applicationLinks ?? []).filter((link) =>
        applicationIds.has(link.applicationId),
      ),
    }));
  const generationRuns = allInterviewGenerationRuns
    .filter(
      (run) => run.userId === userId && applicationIds.has(run.applicationId),
    )
    .map(publicInterviewGenerationRun);
  const generationRunIds = new Set(generationRuns.map((run) => run.id));
  const generationRunApplications = new Map(
    generationRuns.map((run) => [run.id, run.applicationId]),
  );
  const generationCandidates = allInterviewGenerationCandidates
    .filter(
      (candidate) =>
        candidate.userId === userId &&
        applicationIds.has(candidate.applicationId) &&
        generationRunIds.has(candidate.runId) &&
        generationRunApplications.get(candidate.runId) ===
          candidate.applicationId,
    )
    .map(publicInterviewGenerationCandidate);
  const [eventGroups, requirementGroups, suggestionGroups, versionGroups] = await Promise.all([
    Promise.all(
      applications.map((application) =>
        dependencies.listApplicationEvents(userId, application.id),
      ),
    ),
    Promise.all(
      applications.map((application) =>
        dependencies.listRequirements(userId, application.id),
      ),
    ),
    Promise.all(
      resumeRuns.map((run) =>
        dependencies.listResumeSuggestions(userId, run.id),
      ),
    ),
    Promise.all(
      applications.map((application) =>
        dependencies.listResumeVersions(userId, application.id),
      ),
    ),
  ]);
  const stageEvents = eventGroups
    .flat()
    .filter(
      (event) =>
        event.userId === userId && applicationIds.has(event.applicationId),
    );
  const requirements = requirementGroups
    .flat()
    .filter((requirement) => applicationIds.has(requirement.applicationId));
  const resumeSuggestions = suggestionGroups
    .flat()
    .filter((suggestion) => applicationIds.has(suggestion.applicationId));
  const resumeVersions = versionGroups
    .flat()
    .filter(
      (version) =>
        version.userId === userId && applicationIds.has(version.applicationId),
    );
  const zip = new JSZip();

  zip.file(
    "profile.json",
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        profile: ownedProfile,
        facts,
      },
      null,
      2,
    ),
  );
  zip.file(
    "source-assets.json",
    JSON.stringify(assets.map(publicAssetMetadata), null, 2),
  );
  zip.file(
    "application-workspaces.json",
    JSON.stringify(
      {
        applications,
        stageEvents,
        analysisRuns,
        requirements,
        resumeRuns,
        resumeSuggestions,
        resumeVersions,
      },
      null,
      2,
    ),
  );
  zip.file(
    "interview-preparation.json",
    JSON.stringify(
      { questions: interviewQuestions, generationRuns, generationCandidates },
      null,
      2,
    ),
  );

  for (const asset of assets) {
    const blob = await dependencies.download(asset.storagePath);
    zip.file(
      `files/${asset.id}/${safeFilename(asset.originalName)}`,
      Buffer.from(await blob.arrayBuffer()),
    );
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
