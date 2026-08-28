import { z } from "zod";

import { applicationRepository } from "@/features/applications/repository";
import {
  buildResumeJDDifferenceMarkdown,
  safeResumeJDDifferenceMarkdownFilename,
} from "@/features/resume-jd-difference/markdown";
import { resumeJDDifferenceRepository } from "@/features/resume-jd-difference/repository";
import { getCurrentUser } from "@/lib/auth/require-user";

export const runtime = "nodejs";
export const maxDuration = 30;

const idSchema = z.uuid();

function encodedFilename(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const applicationId = idSchema.safeParse(id);
  if (!applicationId.success) {
    return Response.json({ error: "application-not-found" }, { status: 404 });
  }
  const url = new URL(request.url);
  const runId = idSchema.safeParse(url.searchParams.get("runId"));
  if (!runId.success) {
    return Response.json(
      { error: "resume-jd-difference-run-required" },
      { status: 400 },
    );
  }
  const stale = url.searchParams.get("stale") === "1";

  try {
    const application = await applicationRepository.get(
      user.id,
      applicationId.data,
    );
    if (!application) {
      return Response.json({ error: "application-not-found" }, { status: 404 });
    }
    const run = await resumeJDDifferenceRepository.getOwned(
      user.id,
      runId.data,
    );
    if (
      !run ||
      run.userId !== user.id ||
      run.applicationId !== application.id
    ) {
      return Response.json(
        { error: "resume-jd-difference-run-not-found" },
        { status: 404 },
      );
    }
    if (run.status !== "succeeded" || !run.result) {
      return Response.json(
        { error: "resume-jd-difference-export-not-ready" },
        { status: 409 },
      );
    }
    if (!stale && run.sourceAssetId !== application.resumeSourceAssetId) {
      return Response.json(
        { error: "resume-jd-difference-export-not-current" },
        { status: 409 },
      );
    }

    const filename = safeResumeJDDifferenceMarkdownFilename(
      application.companyName,
      application.roleTitle,
    );
    const markdown = buildResumeJDDifferenceMarkdown({
      companyName: application.companyName,
      roleTitle: application.roleTitle,
      exportedAt: new Date(),
      sourceFilename: run.sourceFilename,
      stale,
      result: run.result,
    });
    return new Response(markdown, {
      status: 200,
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="difference-analysis.md"; filename*=UTF-8''${encodedFilename(filename)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "resume-jd-difference-export-failed" },
      { status: 500 },
    );
  }
}
