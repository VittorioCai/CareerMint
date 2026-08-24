import { applicationRepository } from "@/features/applications/repository";
import { jdAnalysisRepository } from "@/features/jd-analysis/repository";
import { createResumeGapExportGetHandler } from "@/features/resume-gaps/export-http";
import { resumeGapRepository } from "@/features/resume-gaps/repository";
import { getCurrentUser } from "@/lib/auth/require-user";

export const runtime = "nodejs";

export const GET = createResumeGapExportGetHandler({
  getCurrentUser,
  getApplication: applicationRepository.get,
  getLatestSucceededAnalysis: jdAnalysisRepository.getLatestSucceeded,
  getCurrentSucceededGap(
    userId,
    applicationId,
    sourceAssetId,
    analysisRunId,
  ) {
    return resumeGapRepository.getLatestForCombination(
      userId,
      applicationId,
      sourceAssetId,
      analysisRunId,
      true,
    );
  },
  listGapItems: resumeGapRepository.listItems,
});
