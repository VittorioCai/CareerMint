import { getOwnedProfile } from "@/features/account/repository";
import { applicationRepository } from "@/features/applications/repository";
import { careerFactRepository } from "@/features/career-profile/repository";
import { interviewPreparationRepository } from "@/features/interview-preparation/repository";
import { interviewQuestionGenerationRepository } from "@/features/interview-preparation/generation-repository";
import {
  RESUME_JD_DIFFERENCE_EXPORT_SELECT,
  buildAccountExport,
} from "@/features/privacy/export";
import { listAssets } from "@/features/source-assets/repository";
import { downloadSource } from "@/features/source-assets/storage";
import { getCurrentUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    outputLocale: run.output_locale,
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
      listResumeJDDifferenceRuns,
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
