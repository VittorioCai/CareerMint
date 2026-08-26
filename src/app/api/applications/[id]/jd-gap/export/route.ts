import { z } from "zod";

import { applicationRepository } from "@/features/applications/repository";
import { jdGapV3Repository } from "@/features/jd-gap-analysis/gap-repository";
import {
  buildJDGapMarkdown,
  safeJDGapMarkdownFilename,
} from "@/features/jd-gap-analysis/markdown";
import { jdStructureRepository } from "@/features/jd-gap-analysis/structure-repository";
import { getCurrentUser } from "@/lib/auth/require-user";

export const runtime = "nodejs";
export const maxDuration = 30;

const applicationIdSchema = z.uuid();

function encodedFilename(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const parsedId = applicationIdSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "application-not-found" }, { status: 404 });
  }

  try {
    const application = await applicationRepository.get(user.id, parsedId.data);
    if (!application) {
      return Response.json({ error: "application-not-found" }, { status: 404 });
    }
    if (!application.resumeSourceAssetId) {
      return Response.json({ error: "jd-gap-export-not-current" }, { status: 409 });
    }

    const structure = await jdStructureRepository.getLatest(user.id, application.id);
    if (
      !structure ||
      structure.status !== "succeeded" ||
      structure.userId !== user.id ||
      structure.applicationId !== application.id
    ) {
      return Response.json({ error: "jd-gap-export-not-current" }, { status: 409 });
    }

    const gap = await jdGapV3Repository.getLatestForCombination(
      user.id,
      application.id,
      application.resumeSourceAssetId,
      structure.id,
    );
    if (
      !gap ||
      gap.status !== "succeeded" ||
      gap.userId !== user.id ||
      gap.applicationId !== application.id ||
      gap.sourceAssetId !== application.resumeSourceAssetId ||
      gap.structureRunId !== structure.id
    ) {
      return Response.json({ error: "jd-gap-export-not-current" }, { status: 409 });
    }

    const view = await jdGapV3Repository.listView(user.id, gap.id);
    if (
      !view ||
      view.run.id !== gap.id ||
      view.run.userId !== user.id ||
      view.run.applicationId !== application.id ||
      view.run.sourceAssetId !== application.resumeSourceAssetId ||
      view.run.structureRunId !== structure.id ||
      view.structureRun.id !== structure.id ||
      view.structureRun.userId !== user.id ||
      view.structureRun.applicationId !== application.id
    ) {
      return Response.json({ error: "jd-gap-export-not-current" }, { status: 409 });
    }

    const filename = safeJDGapMarkdownFilename(
      application.companyName,
      application.roleTitle,
    );
    const markdown = buildJDGapMarkdown({
      companyName: application.companyName,
      roleTitle: application.roleTitle,
      exportedAt: new Date(),
      baselineFilename: gap.sourceFilename,
      requirements: view.requirements,
    });
    return new Response(markdown, {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="jd-gap-analysis.md"; filename*=UTF-8''${encodedFilename(filename)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "jd-gap-export-failed" }, { status: 500 });
  }
}
