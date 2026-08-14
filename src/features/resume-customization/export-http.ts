import { z } from "zod";

import type { AccountProfile } from "@/features/account/repository";
import type { Application } from "@/features/applications/schemas";

import {
  buildResumeDocx,
  buildResumePdf,
  type ResumeExportDocument,
} from "./document";
import type { ResumeVersion } from "./schemas";

const idSchema = z.uuid();
const formatSchema = z.enum(["docx", "pdf"]);

export type ResumeExportGetDependencies = {
  getCurrentUser(): Promise<{ id: string; email?: string } | null>;
  getApplication(
    userId: string,
    applicationId: string,
  ): Promise<
    Pick<
      Application,
      "id" | "userId" | "companyName" | "roleTitle"
    > | null
  >;
  getVersion(
    userId: string,
    applicationId: string,
    versionId: string,
  ): Promise<ResumeVersion | null>;
  getProfile(
    userId: string,
  ): Promise<Pick<AccountProfile, "displayName"> | null>;
  buildDocx(input: ResumeExportDocument): Promise<Uint8Array>;
  buildPdf(input: ResumeExportDocument): Promise<Uint8Array>;
};

function safeFilePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function downloadName(input: {
  companyName: string;
  roleTitle: string;
  versionNumber: number;
  format: "docx" | "pdf";
}) {
  const identity = [
    safeFilePart(input.companyName),
    safeFilePart(input.roleTitle),
  ]
    .filter(Boolean)
    .join("-");
  return `${identity || "resume"}-v${input.versionNumber}.${input.format}`;
}

export function createResumeExportGetHandler(
  dependencies: ResumeExportGetDependencies,
) {
  return async function get(
    request: Request,
    context: { params: Promise<{ id: string; versionId: string }> },
  ) {
    const user = await dependencies.getCurrentUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

    const format = formatSchema.safeParse(
      new URL(request.url).searchParams.get("format"),
    );
    if (!format.success) {
      return Response.json(
        { error: "invalid-resume-export-format" },
        { status: 400 },
      );
    }

    const params = await context.params;
    const applicationId = idSchema.safeParse(params.id);
    const versionId = idSchema.safeParse(params.versionId);
    if (!applicationId.success || !versionId.success) {
      return Response.json({ error: "resume-not-found" }, { status: 404 });
    }

    try {
      const application = await dependencies.getApplication(
        user.id,
        applicationId.data,
      );
      if (!application || application.userId !== user.id) {
        return Response.json({ error: "resume-not-found" }, { status: 404 });
      }

      const [version, profile] = await Promise.all([
        dependencies.getVersion(user.id, application.id, versionId.data),
        dependencies.getProfile(user.id),
      ]);
      if (
        !version ||
        version.userId !== user.id ||
        version.applicationId !== application.id
      ) {
        return Response.json({ error: "resume-not-found" }, { status: 404 });
      }

      const email = user.email?.trim() ?? "";
      const candidateName =
        profile?.displayName?.trim() || email.split("@")[0] || "Candidate";
      const document: ResumeExportDocument = {
        candidateName,
        email,
        companyName: application.companyName,
        roleTitle: application.roleTitle,
        versionNumber: version.versionNumber,
        template: version.template,
        items: version.items.map((item) => ({
          section: item.section,
          content: item.content,
        })),
      };
      const bytes =
        format.data === "docx"
          ? await dependencies.buildDocx(document)
          : await dependencies.buildPdf(document);
      const filename = downloadName({
        companyName: application.companyName,
        roleTitle: application.roleTitle,
        versionNumber: version.versionNumber,
        format: format.data,
      });
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Content-Type":
            format.data === "docx"
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : "application/pdf",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if (
        format.data === "pdf" &&
        error instanceof Error &&
        error.message === "pdf-unsupported-characters"
      ) {
        return Response.json(
          { error: "pdf-unsupported-characters", fallback: "docx" },
          { status: 400 },
        );
      }
      return Response.json({ error: "resume-export-failed" }, { status: 500 });
    }
  };
}

export const defaultResumeExportBuilders = {
  buildDocx: buildResumeDocx,
  buildPdf: buildResumePdf,
};
