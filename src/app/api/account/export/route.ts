import { getOwnedProfile } from "@/features/account/repository";
import { careerFactRepository } from "@/features/career-profile/repository";
import { buildAccountExport } from "@/features/privacy/export";
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
