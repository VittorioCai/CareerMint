import { getOwnedProfile } from "@/features/account/repository";
import { applicationRepository } from "@/features/applications/repository";
import {
  createResumeExportGetHandler,
  defaultResumeExportBuilders,
} from "@/features/resume-customization/export-http";
import { resumeCustomizationRepository } from "@/features/resume-customization/repository";
import { getCurrentUser } from "@/lib/auth/require-user";

export const runtime = "nodejs";

export const GET = createResumeExportGetHandler({
  getCurrentUser,
  getApplication: applicationRepository.get,
  getVersion: resumeCustomizationRepository.getVersion,
  getProfile: getOwnedProfile,
  ...defaultResumeExportBuilders,
});
