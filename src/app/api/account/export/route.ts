import { getOwnedProfile } from "@/features/account/repository";
import { applicationRepository } from "@/features/applications/repository";
import { careerFactRepository } from "@/features/career-profile/repository";
import { jdAnalysisRepository } from "@/features/jd-analysis/repository";
import { interviewPreparationRepository } from "@/features/interview-preparation/repository";
import { interviewQuestionGenerationRepository } from "@/features/interview-preparation/generation-repository";
import {
  JD_GAP_V3_ASSESSMENT_EXPORT_SELECT,
  JD_GAP_V3_RESULT_EXPORT_SELECT,
  JD_GAP_V3_RUN_EXPORT_SELECT,
  JD_STRUCTURE_CRITERION_EXPORT_SELECT,
  JD_STRUCTURE_REQUIREMENT_EXPORT_SELECT,
  JD_STRUCTURE_RUN_EXPORT_SELECT,
  RESUME_JD_DIFFERENCE_EXPORT_SELECT,
  RESUME_GAP_ITEM_EXPORT_SELECT,
  RESUME_GAP_RUN_EXPORT_SELECT,
  buildAccountExport,
} from "@/features/privacy/export";
import { resumeCustomizationRepository } from "@/features/resume-customization/repository";
import { listAssets } from "@/features/source-assets/repository";
import { downloadSource } from "@/features/source-assets/storage";
import { getCurrentUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function listResumeGapRuns(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resume_gap_runs")
    .select(RESUME_GAP_RUN_EXPORT_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error("resume-gap-export-read-failed");
  return (data ?? []).map((run) => ({
    id: run.id,
    userId: run.user_id,
    applicationId: run.application_id,
    analysisRunId: run.analysis_run_id,
    sourceAssetId: run.source_asset_id,
    sourceFilename: run.source_filename,
    sourceSha256: run.source_sha256,
    provider: run.provider,
    model: run.model,
    status: run.status,
    attemptCount: run.attempt_count,
    result: run.result,
    errorCode: run.error_code,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
  }));
}

async function listResumeGapItems(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resume_gap_items")
    .select(RESUME_GAP_ITEM_EXPORT_SELECT)
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error("resume-gap-export-read-failed");
  return (data ?? []).map((item) => ({
    id: item.id,
    runId: item.run_id,
    applicationId: item.application_id,
    userId: item.user_id,
    requirementId: item.requirement_id,
    requirementText: item.requirement_text,
    category: item.category,
    priority: item.priority,
    jdSourceExcerpt: item.jd_source_excerpt,
    resumeCoverage: item.resume_coverage,
    verifiedResumeExcerpt: item.verified_resume_excerpt,
    sortOrder: item.sort_order,
    createdAt: item.created_at,
  }));
}

async function listJDStructureRuns(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jd_structure_runs")
    .select(JD_STRUCTURE_RUN_EXPORT_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error("jd-gap-v3-export-read-failed");
  return (data ?? []).map((run) => ({
    id: run.id,
    userId: run.user_id,
    applicationId: run.application_id,
    provider: run.provider,
    model: run.model,
    schemaVersion: run.schema_version,
    promptVersion: run.prompt_version,
    status: run.status,
    attemptCount: run.attempt_count,
    result: run.result,
    errorCode: run.error_code,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
  }));
}

async function listJDStructureRequirements(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jd_structure_requirements")
    .select(JD_STRUCTURE_REQUIREMENT_EXPORT_SELECT)
    .eq("user_id", userId)
    .order("run_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error("jd-gap-v3-export-read-failed");
  return (data ?? []).map((requirement) => ({
    id: requirement.id,
    runId: requirement.run_id,
    applicationId: requirement.application_id,
    userId: requirement.user_id,
    category: requirement.category,
    requirementType: requirement.requirement_type,
    originalText: requirement.original_text,
    translationZh: requirement.translation_zh,
    sourceExcerpt: requirement.source_excerpt,
    allowsEquivalent: requirement.allows_equivalent,
    explicitGate: requirement.explicit_gate,
    sortOrder: requirement.sort_order,
    createdAt: requirement.created_at,
  }));
}

async function listJDStructureCriteria(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jd_structure_criteria")
    .select(JD_STRUCTURE_CRITERION_EXPORT_SELECT)
    .eq("user_id", userId)
    .order("run_id", { ascending: true })
    .order("requirement_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error("jd-gap-v3-export-read-failed");
  return (data ?? []).map((criterion) => ({
    id: criterion.id,
    requirementId: criterion.requirement_id,
    runId: criterion.run_id,
    applicationId: criterion.application_id,
    userId: criterion.user_id,
    groupKey: criterion.group_key,
    groupRule: criterion.group_rule,
    kind: criterion.kind,
    originalText: criterion.original_text,
    translationZh: criterion.translation_zh,
    constraint: criterion.constraint_payload,
    sortOrder: criterion.sort_order,
    createdAt: criterion.created_at,
  }));
}

async function listJDGapV3Runs(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jd_gap_v3_runs")
    .select(JD_GAP_V3_RUN_EXPORT_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error("jd-gap-v3-export-read-failed");
  return (data ?? []).map((run) => ({
    id: run.id,
    userId: run.user_id,
    applicationId: run.application_id,
    structureRunId: run.structure_run_id,
    sourceAssetId: run.source_asset_id,
    sourceFilename: run.source_filename,
    provider: run.provider,
    model: run.model,
    schemaVersion: run.schema_version,
    promptVersion: run.prompt_version,
    policyVersion: run.policy_version,
    status: run.status,
    attemptCount: run.attempt_count,
    result: run.result,
    errorCode: run.error_code,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    startedAt: run.started_at,
    finishedAt: run.finished_at,
  }));
}

async function listJDGapV3RequirementResults(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jd_gap_v3_requirement_results")
    .select(JD_GAP_V3_RESULT_EXPORT_SELECT)
    .eq("user_id", userId)
    .order("run_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error("jd-gap-v3-export-read-failed");
  return (data ?? []).map((result) => ({
    id: result.id,
    runId: result.run_id,
    requirementId: result.requirement_id,
    applicationId: result.application_id,
    userId: result.user_id,
    coverageStatus: result.coverage_status,
    impactLevel: result.impact_level,
    coveredCriterionCount: result.covered_criterion_count,
    missingCriterionCount: result.missing_criterion_count,
    sortOrder: result.sort_order,
    createdAt: result.created_at,
  }));
}

async function listJDGapV3Assessments(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jd_gap_v3_criterion_assessments")
    .select(JD_GAP_V3_ASSESSMENT_EXPORT_SELECT)
    .eq("user_id", userId)
    .order("run_id", { ascending: true })
    .order("requirement_id", { ascending: true })
    .order("criterion_id", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error("jd-gap-v3-export-read-failed");
  return (data ?? []).map((assessment) => ({
    id: assessment.id,
    runId: assessment.run_id,
    criterionId: assessment.criterion_id,
    requirementId: assessment.requirement_id,
    applicationId: assessment.application_id,
    userId: assessment.user_id,
    resumeEvidenceStatus: assessment.resume_evidence_status,
    verifiedResumeExcerpt: assessment.verified_resume_excerpt,
    profileFactIds: assessment.profile_fact_ids,
    gapType: assessment.gap_type,
    reasonZh: assessment.reason_zh,
    userQuestionZh: assessment.user_question_zh,
    createdAt: assessment.created_at,
  }));
}

async function listResumeJDDifferenceRuns(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resume_jd_difference_runs")
    .select(RESUME_JD_DIFFERENCE_EXPORT_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error("resume-jd-difference-export-read-failed");
  return (data ?? []).map((run) => ({
    id: run.id,
    userId,
    applicationId: run.application_id,
    sourceAssetId: run.source_asset_id,
    sourceFilename: run.source_filename,
    provider: run.provider,
    model: run.model,
    schemaVersion: run.schema_version,
    promptVersion: run.prompt_version,
    policyVersion: run.policy_version,
    status: run.status,
    result: run.result,
    aiUsage: run.ai_usage,
    estimatedCostUsd: run.estimated_cost_usd,
    completedAt: run.completed_at,
    createdAt: run.created_at,
  }));
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    const archive = await buildAccountExport(user.id, {
      getProfile: getOwnedProfile,
      listFacts: (userId) => careerFactRepository.list(userId),
      listAssets,
      listApplications: applicationRepository.list,
      listApplicationEvents: applicationRepository.listEvents,
      listAnalysisRuns: jdAnalysisRepository.listRuns,
      listRequirements: jdAnalysisRepository.listRequirements,
      listResumeRuns: resumeCustomizationRepository.listRuns,
      listResumeGapRuns,
      listResumeGapItems,
      listJDStructureRuns,
      listJDStructureRequirements,
      listJDStructureCriteria,
      listJDGapV3Runs,
      listJDGapV3RequirementResults,
      listJDGapV3Assessments,
      listResumeJDDifferenceRuns,
      listResumeSuggestions: resumeCustomizationRepository.listSuggestions,
      listResumeVersions: resumeCustomizationRepository.listVersions,
      listInterviewQuestions: interviewPreparationRepository.list,
      listInterviewGenerationRuns: interviewQuestionGenerationRepository.listRuns,
      listInterviewGenerationCandidates:
        interviewQuestionGenerationRepository.listAllCandidates,
      download: downloadSource,
    });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(new Uint8Array(archive), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="career-profile-export-${date}.zip"`,
        "cache-control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "account-export-failed" }, { status: 500 });
  }
}
