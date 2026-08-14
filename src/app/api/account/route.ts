import { z } from "zod";

import {
  AccountDeletionError,
  deleteOwnedAccount,
} from "@/features/privacy/delete-account";
import { listAssets } from "@/features/source-assets/repository";
import { removeSources } from "@/features/source-assets/storage";
import { getCurrentUser } from "@/lib/auth/require-user";
import { createAdminClient } from "@/lib/supabase/admin";

const deletionRequestSchema = z
  .object({ confirmation: z.literal("DELETE") })
  .strict();

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid-confirmation" }, { status: 400 });
  }
  if (!deletionRequestSchema.safeParse(body).success) {
    return Response.json({ error: "invalid-confirmation" }, { status: 400 });
  }

  try {
    await deleteOwnedAccount(user, {
      listAssets,
      removeSources,
      async deleteAuthUser(userId) {
        const { error } = await createAdminClient().auth.admin.deleteUser(userId);
        if (error) throw new Error("auth-account-delete-failed");
      },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    if (
      error instanceof AccountDeletionError &&
      error.code === "storage-delete-incomplete"
    ) {
      return Response.json(
        { error: "storage-delete-incomplete" },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "account-delete-failed" },
      { status: 500 },
    );
  }
}
