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

export const runtime = "nodejs";
export const maxDuration = 60;

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
      listResumeSuggestions: resumeCustomizationRepository.listSuggestions,
      listResumeVersions: resumeCustomizationRepository.listVersions,
      listInterviewQuestions: interviewPreparationRepository.list,
      listInterviewGenerationRuns: interviewQuestionGenerationRepository.listRuns,
      listInterviewGenerationCandidates:
        async (userId) =>
          (await interviewQuestionGenerationRepository.listAllCandidates(userId)).map(
            (candidate) => ({ ...candidate, userId }),
          ),
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
