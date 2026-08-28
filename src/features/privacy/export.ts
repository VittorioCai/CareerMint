import JSZip from "jszip";

import { resumeJDDifferenceOutputSchema } from "@/features/resume-jd-difference/schemas";

export const RESUME_GAP_RUN_EXPORT_SELECT =
  "id,user_id,application_id,analysis_run_id,source_asset_id,source_filename,source_sha256,provider,model,status,attempt_count,result,error_code,created_at,updated_at,started_at,finished_at";

export const RESUME_GAP_ITEM_EXPORT_SELECT =
  "id,run_id,application_id,user_id,requirement_id,requirement_text,category,priority,jd_source_excerpt,resume_coverage,verified_resume_excerpt,sort_order,created_at";

export const JD_STRUCTURE_RUN_EXPORT_SELECT =
  "id,user_id,application_id,provider,model,schema_version,prompt_version,status,attempt_count,result,error_code,created_at,updated_at,started_at,finished_at";
export const JD_STRUCTURE_REQUIREMENT_EXPORT_SELECT =
  "id,run_id,application_id,user_id,category,requirement_type,original_text,translation_zh,source_excerpt,allows_equivalent,explicit_gate,sort_order,created_at";
export const JD_STRUCTURE_CRITERION_EXPORT_SELECT =
  "id,requirement_id,run_id,application_id,user_id,group_key,group_rule,kind,original_text,translation_zh,constraint_payload,sort_order,created_at";
export const JD_GAP_V3_RUN_EXPORT_SELECT =
  "id,user_id,application_id,structure_run_id,source_asset_id,source_filename,provider,model,schema_version,prompt_version,policy_version,status,attempt_count,result,error_code,created_at,updated_at,started_at,finished_at";
export const JD_GAP_V3_RESULT_EXPORT_SELECT =
  "id,run_id,requirement_id,application_id,user_id,coverage_status,impact_level,covered_criterion_count,missing_criterion_count,sort_order,created_at";
export const JD_GAP_V3_ASSESSMENT_EXPORT_SELECT =
  "id,run_id,criterion_id,requirement_id,application_id,user_id,resume_evidence_status,verified_resume_excerpt,profile_fact_ids,gap_type,reason_zh,user_question_zh,created_at";
export const RESUME_JD_DIFFERENCE_EXPORT_SELECT =
  "id,application_id,source_asset_id,source_filename,provider,model,schema_version,prompt_version,policy_version,status,result,ai_usage,estimated_cost_usd,completed_at,created_at";

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

type ResumeGapExportRun = OwnedRecord & {
  id: string;
  applicationId: string;
  analysisRunId: string;
  sourceAssetId: string | null;
  sourceFilename: string;
  sourceSha256: string;
  provider: string;
  model: string;
  status: string;
  attemptCount: number;
  result?: unknown;
  errorCode?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

type ResumeGapExportItem = OwnedRecord & {
  id: string;
  runId: string;
  applicationId: string;
  requirementId: string | null;
  requirementText: string;
  category: string;
  priority: string;
  jdSourceExcerpt: string;
  resumeCoverage: string;
  verifiedResumeExcerpt: string | null;
  sortOrder: number;
  createdAt: string;
};

type JDStructureExportRun = OwnedRecord & {
  id: string;
  applicationId: string;
  provider: string;
  model: string;
  schemaVersion: string;
  promptVersion: string;
  status: string;
  attemptCount: number;
  result?: unknown;
  errorCode?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

type JDStructureExportRequirement = OwnedRecord & {
  id: string;
  runId: string;
  applicationId: string;
  category: string;
  requirementType: string;
  originalText: string;
  translationZh: string;
  sourceExcerpt: string;
  allowsEquivalent: boolean;
  explicitGate: boolean;
  sortOrder: number;
  createdAt: string;
};

type JDStructureExportCriterion = OwnedRecord & {
  id: string;
  requirementId: string;
  runId: string;
  applicationId: string;
  groupKey: string;
  groupRule: string;
  kind: string;
  originalText: string;
  translationZh: string;
  constraint: unknown;
  sortOrder: number;
  createdAt: string;
};

type JDGapV3ExportRun = OwnedRecord & {
  id: string;
  applicationId: string;
  structureRunId: string;
  sourceAssetId: string | null;
  sourceFilename: string;
  provider: string;
  model: string;
  schemaVersion: string;
  promptVersion: string;
  policyVersion: string;
  status: string;
  attemptCount: number;
  result?: unknown;
  errorCode?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

type JDGapV3ExportRequirementResult = OwnedRecord & {
  id: string;
  runId: string;
  requirementId: string;
  applicationId: string;
  coverageStatus: string;
  impactLevel: string;
  coveredCriterionCount: number;
  missingCriterionCount: number;
  sortOrder: number;
  createdAt: string;
};

type JDGapV3ExportAssessment = OwnedRecord & {
  id: string;
  runId: string;
  criterionId: string;
  requirementId: string;
  applicationId: string;
  resumeEvidenceStatus: string;
  verifiedResumeExcerpt: string | null;
  profileFactIds: string[];
  gapType: string;
  reasonZh: string;
  userQuestionZh: string | null;
  createdAt: string;
};

type ResumeJDDifferenceExportRun = OwnedRecord & {
  id: string;
  applicationId: string;
  sourceAssetId: string | null;
  sourceFilename: string;
  provider: string;
  model: string;
  schemaVersion: string;
  promptVersion: string;
  policyVersion: string;
  status: string;
  result: unknown;
  aiUsage: unknown;
  estimatedCostUsd: number | null;
  completedAt: string | null;
  createdAt: string;
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
  listResumeGapRuns(userId: string): Promise<ResumeGapExportRun[]>;
  listResumeGapItems(userId: string): Promise<ResumeGapExportItem[]>;
  listJDStructureRuns(userId: string): Promise<JDStructureExportRun[]>;
  listJDStructureRequirements(
    userId: string,
  ): Promise<JDStructureExportRequirement[]>;
  listJDStructureCriteria(
    userId: string,
  ): Promise<JDStructureExportCriterion[]>;
  listJDGapV3Runs(userId: string): Promise<JDGapV3ExportRun[]>;
  listJDGapV3RequirementResults(
    userId: string,
  ): Promise<JDGapV3ExportRequirementResult[]>;
  listJDGapV3Assessments(
    userId: string,
  ): Promise<JDGapV3ExportAssessment[]>;
  listResumeJDDifferenceRuns(
    userId: string,
  ): Promise<ResumeJDDifferenceExportRun[]>;
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
  return sanitized && sanitized !== "." && sanitized !== ".."
    ? sanitized
    : "source-file";
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

function safeResumeGapCounts(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  const fields = [
    "acceptedItemCount",
    "coveredItemCount",
    "partialItemCount",
    "missingItemCount",
  ] as const;
  if (
    !fields.every(
      (field) =>
        typeof result[field] === "number" &&
        Number.isSafeInteger(result[field]) &&
        (result[field] as number) >= 0 &&
        (result[field] as number) <= 80,
    )
  ) {
    return null;
  }
  if (
    result.acceptedItemCount !==
    (result.coveredItemCount as number) +
      (result.partialItemCount as number) +
      (result.missingItemCount as number)
  ) {
    return null;
  }
  return Object.fromEntries(
    fields.map((field) => [field, result[field]]),
  );
}

function publicResumeGapRun(
  run: ResumeGapExportRun,
  ownedAssetIds: ReadonlySet<string>,
) {
  return {
    id: run.id,
    applicationId: run.applicationId,
    baselineAssetId:
      run.sourceAssetId && ownedAssetIds.has(run.sourceAssetId)
        ? run.sourceAssetId
        : null,
    analysisRunId: run.analysisRunId,
    sourceFilename: run.sourceFilename,
    sourceSha256: run.sourceSha256,
    provider: run.provider,
    model: run.model,
    status: run.status,
    attemptCount: run.attemptCount,
    counts: safeResumeGapCounts(run.result),
    errorCode: safeErrorCode(run.errorCode),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
  };
}

function publicResumeGapItem(item: ResumeGapExportItem) {
  return {
    id: item.id,
    runId: item.runId,
    applicationId: item.applicationId,
    requirementId: item.requirementId,
    requirementText: item.requirementText,
    category: item.category,
    priority: item.priority,
    jdSourceExcerpt: item.jdSourceExcerpt,
    resumeCoverage: item.resumeCoverage,
    verifiedResumeExcerpt: item.verifiedResumeExcerpt,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt,
  };
}

function boundedText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Array.from(trimmed).slice(0, maxLength).join("");
}

function boundedInteger(value: unknown, max: number) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= max
    ? value
    : null;
}

function safeStructureCounts(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  const requirementCount = boundedInteger(result.requirementCount, 80);
  const criterionCount = boundedInteger(result.criterionCount, 960);
  if (requirementCount === null || criterionCount === null) return null;
  return { requirementCount, criterionCount };
}

function safeJDGapV3Counts(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  const requirementCount = boundedInteger(result.requirementCount, 80);
  const criterionCount = boundedInteger(result.criterionCount, 960);
  const completeCount = boundedInteger(result.completeCount, 80);
  const partialCount = boundedInteger(result.partialCount, 80);
  const noneCount = boundedInteger(result.noneCount, 80);
  const needsConfirmationCount = boundedInteger(
    result.needsConfirmationCount,
    80,
  );
  if (
    requirementCount === null ||
    criterionCount === null ||
    completeCount === null ||
    partialCount === null ||
    noneCount === null ||
    needsConfirmationCount === null ||
    requirementCount !==
      completeCount + partialCount + noneCount + needsConfirmationCount
  ) {
    return null;
  }
  return {
    requirementCount,
    criterionCount,
    completeCount,
    partialCount,
    noneCount,
    needsConfirmationCount,
  };
}

function safeConstraint(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const constraint = value as Record<string, unknown>;
  const operators = new Set([
    "none",
    "exact",
    "gte",
    "one_of",
    "equivalent_allowed",
  ]);
  if (
    typeof constraint.operator !== "string" ||
    !operators.has(constraint.operator) ||
    !(constraint.value === null || typeof constraint.value === "string") ||
    !(constraint.unit === null || typeof constraint.unit === "string")
  ) {
    return null;
  }
  return {
    operator: constraint.operator,
    value: constraint.value === null
      ? null
      : boundedText(constraint.value, 160),
    unit: constraint.unit === null ? null : boundedText(constraint.unit, 40),
  };
}

function publicJDStructureRun(run: JDStructureExportRun) {
  return {
    id: run.id,
    applicationId: run.applicationId,
    provider: run.provider,
    model: run.model,
    schemaVersion: run.schemaVersion,
    promptVersion: run.promptVersion,
    status: run.status,
    attemptCount: run.attemptCount,
    counts: safeStructureCounts(run.result),
    errorCode: safeErrorCode(run.errorCode),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
  };
}

function publicJDStructureRequirement(
  requirement: JDStructureExportRequirement,
) {
  return {
    id: requirement.id,
    runId: requirement.runId,
    applicationId: requirement.applicationId,
    category: requirement.category,
    requirementType: requirement.requirementType,
    originalText: boundedText(requirement.originalText, 500),
    translationZh: boundedText(requirement.translationZh, 1_000),
    sourceExcerpt: boundedText(requirement.sourceExcerpt, 1_000),
    allowsEquivalent: requirement.allowsEquivalent,
    explicitGate: requirement.explicitGate,
    sortOrder: requirement.sortOrder,
    createdAt: requirement.createdAt,
  };
}

function publicJDStructureCriterion(criterion: JDStructureExportCriterion) {
  return {
    id: criterion.id,
    requirementId: criterion.requirementId,
    runId: criterion.runId,
    applicationId: criterion.applicationId,
    groupKey: criterion.groupKey,
    groupRule: criterion.groupRule,
    kind: criterion.kind,
    originalText: boundedText(criterion.originalText, 500),
    translationZh: boundedText(criterion.translationZh, 1_000),
    constraint: safeConstraint(criterion.constraint),
    sortOrder: criterion.sortOrder,
    createdAt: criterion.createdAt,
  };
}

function publicJDGapV3Run(
  run: JDGapV3ExportRun,
  ownedAssetIds: ReadonlySet<string>,
) {
  return {
    id: run.id,
    applicationId: run.applicationId,
    structureRunId: run.structureRunId,
    baselineAssetId:
      run.sourceAssetId && ownedAssetIds.has(run.sourceAssetId)
        ? run.sourceAssetId
        : null,
    baselineFilename: boundedText(run.sourceFilename, 260),
    provider: run.provider,
    model: run.model,
    schemaVersion: run.schemaVersion,
    promptVersion: run.promptVersion,
    policyVersion: run.policyVersion,
    status: run.status,
    attemptCount: run.attemptCount,
    counts: safeJDGapV3Counts(run.result),
    errorCode: safeErrorCode(run.errorCode),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
  };
}

function publicJDGapV3RequirementResult(
  result: JDGapV3ExportRequirementResult,
) {
  return {
    id: result.id,
    runId: result.runId,
    requirementId: result.requirementId,
    applicationId: result.applicationId,
    coverageStatus: result.coverageStatus,
    impactLevel: result.impactLevel,
    coveredCriterionCount: result.coveredCriterionCount,
    missingCriterionCount: result.missingCriterionCount,
    sortOrder: result.sortOrder,
    createdAt: result.createdAt,
  };
}

function publicJDGapV3Assessment(
  assessment: JDGapV3ExportAssessment,
  ownedFactIds: ReadonlySet<string>,
) {
  return {
    id: assessment.id,
    runId: assessment.runId,
    criterionId: assessment.criterionId,
    requirementId: assessment.requirementId,
    applicationId: assessment.applicationId,
    resumeEvidenceStatus: assessment.resumeEvidenceStatus,
    verifiedResumeExcerpt: assessment.verifiedResumeExcerpt === null
      ? null
      : boundedText(assessment.verifiedResumeExcerpt, 1_000),
    profileFactIds: assessment.profileFactIds.filter((id) =>
      ownedFactIds.has(id),
    ),
    gapType: assessment.gapType,
    reasonZh: boundedText(assessment.reasonZh, 700),
    userQuestionZh: assessment.userQuestionZh === null
      ? null
      : boundedText(assessment.userQuestionZh, 500),
    createdAt: assessment.createdAt,
  };
}

function publicDifferenceAIUsage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const usage = input.usage;
  if (!usage || typeof usage !== "object") return null;
  const tokens = usage as Record<string, unknown>;
  const inputCacheHitTokens = boundedInteger(
    tokens.inputCacheHitTokens,
    1_000_000_000,
  );
  const inputCacheMissTokens = boundedInteger(
    tokens.inputCacheMissTokens,
    1_000_000_000,
  );
  const outputTokens = boundedInteger(tokens.outputTokens, 1_000_000_000);
  if (
    typeof input.provider !== "string" ||
    typeof input.model !== "string" ||
    inputCacheHitTokens === null ||
    inputCacheMissTokens === null ||
    outputTokens === null
  ) {
    return null;
  }
  return {
    provider: boundedText(input.provider, 80),
    model: boundedText(input.model, 160),
    usage: { inputCacheHitTokens, inputCacheMissTokens, outputTokens },
    priceScheduleVersion:
      input.priceScheduleVersion === null
        ? null
        : boundedText(input.priceScheduleVersion, 80),
  };
}

function publicResumeJDDifferenceRun(
  run: ResumeJDDifferenceExportRun,
  ownedAssetIds: ReadonlySet<string>,
) {
  const result = resumeJDDifferenceOutputSchema.safeParse(run.result);
  return {
    id: run.id,
    applicationId: run.applicationId,
    sourceAssetId:
      run.sourceAssetId && ownedAssetIds.has(run.sourceAssetId)
        ? run.sourceAssetId
        : null,
    sourceFilename: boundedText(run.sourceFilename, 260),
    provider: boundedText(run.provider, 80),
    model: boundedText(run.model, 160),
    schemaVersion: boundedText(run.schemaVersion, 80),
    promptVersion: boundedText(run.promptVersion, 80),
    policyVersion: boundedText(run.policyVersion, 80),
    status: boundedText(run.status, 40),
    result: result.success ? result.data : null,
    aiUsage: publicDifferenceAIUsage(run.aiUsage),
    estimatedCostUsd:
      typeof run.estimatedCostUsd === "number" &&
      Number.isFinite(run.estimatedCostUsd) &&
      run.estimatedCostUsd >= 0
        ? run.estimatedCostUsd
        : null,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
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
    allResumeGapRuns,
    allResumeGapItems,
    allJDStructureRuns,
    allJDStructureRequirements,
    allJDStructureCriteria,
    allJDGapV3Runs,
    allJDGapV3RequirementResults,
    allJDGapV3Assessments,
    allResumeJDDifferenceRuns,
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
      dependencies.listResumeGapRuns(userId),
      dependencies.listResumeGapItems(userId),
      dependencies.listJDStructureRuns(userId),
      dependencies.listJDStructureRequirements(userId),
      dependencies.listJDStructureCriteria(userId),
      dependencies.listJDGapV3Runs(userId),
      dependencies.listJDGapV3RequirementResults(userId),
      dependencies.listJDGapV3Assessments(userId),
      dependencies.listResumeJDDifferenceRuns(userId),
      dependencies.listInterviewQuestions(userId),
      dependencies.listInterviewGenerationRuns(userId),
      dependencies.listInterviewGenerationCandidates(userId),
    ]);
  const ownedProfile = profile?.userId === userId ? profile : null;
  const facts = allFacts.filter((fact) => fact.userId === userId);
  const ownedFactIds = new Set(
    facts.flatMap((fact) => {
      const id = (fact as OwnedRecord & { id?: unknown }).id;
      return typeof id === "string" ? [id] : [];
    }),
  );
  const assets = allAssets.filter((asset) => asset.userId === userId);
  const ownedAssetIds = new Set(assets.map((asset) => asset.id));
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
  const resumeGapRuns = allResumeGapRuns.filter(
    (run) => run.userId === userId && applicationIds.has(run.applicationId),
  );
  const resumeGapRunIds = new Set(resumeGapRuns.map((run) => run.id));
  const resumeGapRunApplications = new Map(
    resumeGapRuns.map((run) => [run.id, run.applicationId]),
  );
  const resumeGapItems = allResumeGapItems.filter(
    (item) =>
      item.userId === userId &&
      applicationIds.has(item.applicationId) &&
      resumeGapRunIds.has(item.runId) &&
      resumeGapRunApplications.get(item.runId) === item.applicationId,
  );
  const jdStructureRuns = allJDStructureRuns.filter(
    (run) => run.userId === userId && applicationIds.has(run.applicationId),
  );
  const jdStructureRunById = new Map(
    jdStructureRuns.map((run) => [run.id, run]),
  );
  const jdStructureRequirements = allJDStructureRequirements.filter(
    (requirement) => {
      const run = jdStructureRunById.get(requirement.runId);
      return requirement.userId === userId &&
        applicationIds.has(requirement.applicationId) &&
        run?.applicationId === requirement.applicationId;
    },
  );
  const jdStructureRequirementById = new Map(
    jdStructureRequirements.map((requirement) => [requirement.id, requirement]),
  );
  const jdStructureCriteria = allJDStructureCriteria.filter((criterion) => {
    const requirement = jdStructureRequirementById.get(criterion.requirementId);
    return criterion.userId === userId &&
      applicationIds.has(criterion.applicationId) &&
      requirement?.runId === criterion.runId &&
      requirement.applicationId === criterion.applicationId;
  });
  const jdStructureCriterionById = new Map(
    jdStructureCriteria.map((criterion) => [criterion.id, criterion]),
  );
  const jdGapV3Runs = allJDGapV3Runs.filter((run) => {
    const structureRun = jdStructureRunById.get(run.structureRunId);
    return run.userId === userId &&
      applicationIds.has(run.applicationId) &&
      structureRun?.applicationId === run.applicationId;
  });
  const jdGapV3RunById = new Map(jdGapV3Runs.map((run) => [run.id, run]));
  const jdGapV3RequirementResults = allJDGapV3RequirementResults.filter(
    (result) => {
      const run = jdGapV3RunById.get(result.runId);
      const requirement = jdStructureRequirementById.get(result.requirementId);
      return result.userId === userId &&
        applicationIds.has(result.applicationId) &&
        run?.applicationId === result.applicationId &&
        requirement?.applicationId === result.applicationId &&
        requirement.runId === run.structureRunId;
    },
  );
  const jdGapV3Assessments = allJDGapV3Assessments.filter((assessment) => {
    const run = jdGapV3RunById.get(assessment.runId);
    const requirement = jdStructureRequirementById.get(
      assessment.requirementId,
    );
    const criterion = jdStructureCriterionById.get(assessment.criterionId);
    return assessment.userId === userId &&
      applicationIds.has(assessment.applicationId) &&
      run?.applicationId === assessment.applicationId &&
      requirement?.applicationId === assessment.applicationId &&
      requirement.runId === run.structureRunId &&
      criterion?.requirementId === requirement.id &&
      criterion.runId === run.structureRunId;
  });
  const resumeJDDifferenceRuns = allResumeJDDifferenceRuns.filter(
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
  zip.file(
    "resume-gaps.json",
    JSON.stringify(
      {
        schemaVersion: "resume-gap-history-v1",
        generatedAt: new Date().toISOString(),
        runs: resumeGapRuns.map((run) =>
          publicResumeGapRun(run, ownedAssetIds),
        ),
        items: resumeGapItems.map(publicResumeGapItem),
      },
      null,
      2,
    ),
  );
  zip.file(
    "jd-gap-analysis-v3.json",
    JSON.stringify(
      {
        schemaVersion: "jd-gap-analysis-v3",
        generatedAt: new Date().toISOString(),
        structureRuns: jdStructureRuns.map(publicJDStructureRun),
        requirements: jdStructureRequirements.map(
          publicJDStructureRequirement,
        ),
        criteria: jdStructureCriteria.map(publicJDStructureCriterion),
        gapRuns: jdGapV3Runs.map((run) =>
          publicJDGapV3Run(run, ownedAssetIds),
        ),
        requirementResults: jdGapV3RequirementResults.map(
          publicJDGapV3RequirementResult,
        ),
        assessments: jdGapV3Assessments.map((assessment) =>
          publicJDGapV3Assessment(assessment, ownedFactIds),
        ),
      },
      null,
      2,
    ),
  );
  zip.file(
    "resume-jd-difference.json",
    JSON.stringify(
      {
        schemaVersion: "resume-jd-difference-history-v4",
        generatedAt: new Date().toISOString(),
        runs: resumeJDDifferenceRuns.map((run) =>
          publicResumeJDDifferenceRun(run, ownedAssetIds),
        ),
      },
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
