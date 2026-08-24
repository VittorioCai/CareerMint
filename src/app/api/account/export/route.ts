import { getOwnedProfile } from "@/features/account/repository";
import { applicationRepository } from "@/features/applications/repository";
import { careerFactRepository } from "@/features/career-profile/repository";
import { jdAnalysisRepository } from "@/features/jd-analysis/repository";
import { interviewPreparationRepository } from "@/features/interview-preparation/repository";
import { interviewQuestionGenerationRepository } from "@/features/interview-preparation/generation-repository";
import { buildAccountExport } from "@/features/privacy/export";
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
    .select("*")
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
    .select("*")
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
