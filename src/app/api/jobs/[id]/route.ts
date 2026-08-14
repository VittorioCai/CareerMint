import { z } from "zod";

import { getOwnedJob } from "@/features/jobs/repository";
import { getCurrentUser } from "@/lib/auth/require-user";

const jobIdSchema = z.uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const parsedId = jobIdSchema.safeParse(id);
  if (!parsedId.success) {
    return Response.json({ error: "processing-job-not-found" }, { status: 404 });
  }

  try {
    const job = await getOwnedJob(user.id, parsedId.data);
    if (!job) {
      return Response.json(
        { error: "processing-job-not-found" },
        { status: 404 },
      );
    }

    return Response.json({
      id: job.id,
      status: job.status,
      result: job.result,
      errorCode: job.errorCode,
    });
  } catch {
    return Response.json(
      { error: "processing-job-request-failed" },
      { status: 500 },
    );
  }
}
