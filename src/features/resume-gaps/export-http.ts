import { z } from "zod";

import type { Application } from "@/features/applications/schemas";
import type { JDAnalysisRun } from "@/features/jd-analysis/schemas";

import {
  buildResumeGapMarkdown,
  safeMarkdownFilename,
  type ResumeGapMarkdownItem,
} from "./markdown";
import type { ResumeGapRun } from "./schemas";

const applicationIdSchema = z.uuid();

type ExportApplication = Pick<
  Application,
  "id" | "userId" | "companyName" | "roleTitle" | "resumeSourceAssetId"
>;

type ExportRun = Pick<
  ResumeGapRun,
  | "id"
  | "status"
  | "applicationId"
  | "userId"
  | "analysisRunId"
  | "sourceAssetId"
  | "sourceFilename"
>;

export type ResumeGapExportDependencies = {
  getCurrentUser(): Promise<{ id: string } | null>;
  getApplication(
    userId: string,
    applicationId: string,
  ): Promise<ExportApplication | null>;
  getLatestSucceededAnalysis(
    userId: string,
    applicationId: string,
  ): Promise<Pick<JDAnalysisRun, "id" | "status" | "applicationId" | "userId"> | null>;
  getCurrentSucceededGap(
    userId: string,
    applicationId: string,
    sourceAssetId: string,
    analysisRunId: string,
  ): Promise<ExportRun | null>;
  listGapItems(userId: string, runId: string): Promise<Array<ResumeGapMarkdownItem & { historical?: boolean }>>;
  clock?: () => Date;
};

export function createResumeGapExportGetHandler(
  dependencies: ResumeGapExportDependencies,
) {
  const clock = dependencies.clock ?? (() => new Date());
  return async function get(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    const user = await dependencies.getCurrentUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const parsedId = applicationIdSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json({ error: "application-not-found" }, { status: 404 });
    }

    try {
      const application = await dependencies.getApplication(user.id, parsedId.data);
      if (!application) {
        return Response.json({ error: "application-not-found" }, { status: 404 });
      }
      if (!application.resumeSourceAssetId) {
        return Response.json({ error: "resume-source-required" }, { status: 409 });
      }

      const analysis = await dependencies.getLatestSucceededAnalysis(
        user.id,
        application.id,
      );
      if (
        !analysis ||
        analysis.status !== "succeeded" ||
        analysis.userId !== user.id ||
        analysis.applicationId !== application.id
      ) {
        return Response.json({ error: "jd-analysis-required" }, { status: 409 });
      }

      const gap = await dependencies.getCurrentSucceededGap(
        user.id,
        application.id,
        application.resumeSourceAssetId,
        analysis.id,
      );
      if (
        !gap ||
        gap.status !== "succeeded" ||
        gap.userId !== user.id ||
        gap.applicationId !== application.id ||
        gap.analysisRunId !== analysis.id ||
        gap.sourceAssetId !== application.resumeSourceAssetId
      ) {
        return Response.json({ error: "resume-gap-required" }, { status: 409 });
      }

      const items = (await dependencies.listGapItems(user.id, gap.id)).filter(
        (item) => !item.historical,
      );
      const filename = safeMarkdownFilename(
        application.companyName,
        application.roleTitle,
      );
      const markdown = buildResumeGapMarkdown({
        companyName: application.companyName,
        roleTitle: application.roleTitle,
        exportedAt: clock(),
        baselineFilename: gap.sourceFilename,
        items,
      });
      return new Response(markdown, {
        status: 200,
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="resume-gap.md"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      return Response.json({ error: "resume-gap-export-failed" }, { status: 500 });
    }
  };
}
