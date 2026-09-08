import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import type { ResumeContentType } from "./schemas";

type SourceAssetRow =
  Database["public"]["Tables"]["source_assets"]["Row"];
type SourceAssetStatus = Database["public"]["Enums"]["source_asset_status"];

export type SourceAsset = {
  id: string;
  userId: string;
  originalName: string;
  contentType: string;
  storagePath: string;
  sizeBytes: number;
  sha256: string;
  duplicateOfId: string | null;
  status: SourceAssetStatus;
  errorCode: string | null;
  createdAt: string;
};

export type CreateAssetInput = {
  id: string;
  userId: string;
  originalName: string;
  contentType: ResumeContentType;
  storagePath: string;
  sizeBytes: number;
  sha256: string;
};

export class SourceAssetRepositoryError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SourceAssetRepositoryError";
  }
}

function toSourceAsset(row: SourceAssetRow): SourceAsset {
  return {
    id: row.id,
    userId: row.user_id,
    originalName: row.original_name,
    contentType: row.content_type,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    duplicateOfId: row.duplicate_of_id,
    status: row.status,
    errorCode: row.error_code,
    createdAt: row.created_at,
  };
}

function storageError(code?: string) {
  if (code === "23505") return "source-asset-conflict";
  return "source-asset-storage-error";
}

// Delete has its own mapping: `P0002` is the RPC's own not-found signal, and
// `23503` means some foreign key still restricts the row. Every reference we
// know about is either ON DELETE SET NULL or cleared inside the RPC, so 23503
// means a new restricting reference appeared — surface it rather than hide it
// behind the generic storage code.
function deleteError(code?: string) {
  if (code === "P0002") return "source-asset-not-found";
  if (code === "23503") return "source-asset-in-use";
  return "source-asset-storage-error";
}

export async function createAsset(
  input: CreateAssetInput,
): Promise<SourceAsset> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_assets")
    .insert({
      id: input.id,
      user_id: input.userId,
      original_name: input.originalName,
      content_type: input.contentType,
      storage_path: input.storagePath,
      size_bytes: input.sizeBytes,
      sha256: input.sha256,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new SourceAssetRepositoryError(storageError(error?.code));
  }
  return toSourceAsset(data);
}

export async function listAssets(userId: string): Promise<SourceAsset[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_assets")
    .select("*")
    .eq("user_id", userId)
    .is("duplicate_of_id", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw new SourceAssetRepositoryError(storageError(error.code));
  return (data ?? []).map(toSourceAsset);
}

export async function findCanonicalAssetByHash(
  userId: string,
  sha256: string,
): Promise<SourceAsset | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_assets")
    .select("*")
    .eq("user_id", userId)
    .eq("sha256", sha256)
    .is("duplicate_of_id", null)
    .maybeSingle();

  if (error) throw new SourceAssetRepositoryError(storageError(error.code));
  return data ? toSourceAsset(data) : null;
}

export async function getOwnedAsset(
  userId: string,
  assetId: string,
): Promise<SourceAsset | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_assets")
    .select("*")
    .eq("user_id", userId)
    .eq("id", assetId)
    .maybeSingle();

  if (error) throw new SourceAssetRepositoryError(storageError(error.code));
  return data ? toSourceAsset(data) : null;
}

export async function setAssetStatus(
  userId: string,
  assetId: string,
  status: SourceAssetStatus,
  errorCode: string | null = null,
): Promise<SourceAsset> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_assets")
    .update({ status, error_code: errorCode })
    .eq("user_id", userId)
    .eq("id", assetId)
    .select("*")
    .maybeSingle();

  if (error) throw new SourceAssetRepositoryError(storageError(error.code));
  if (!data) throw new SourceAssetRepositoryError("source-asset-not-found");
  return toSourceAsset(data);
}

// Account deletion needs every file the user owns, and `listAssets` hides
// duplicates — right for a picker, wrong here: a duplicate's storage object is
// just as much the user's data and must go with the account.
export async function listOwnedStoragePaths(
  userId: string,
): Promise<Array<{ userId: string; storagePath: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_assets")
    .select("user_id, storage_path")
    .eq("user_id", userId);

  if (error) throw new SourceAssetRepositoryError(storageError(error.code));
  return (data ?? []).map((asset) => ({
    userId: asset.user_id,
    storagePath: asset.storage_path,
  }));
}

// Storage objects belonging to duplicates outlive their rows, which the RPC
// deletes. Collect them before deleting so the caller can remove them too.
export async function listDuplicateStoragePaths(
  userId: string,
  assetId: string,
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("source_assets")
    .select("storage_path")
    .eq("user_id", userId)
    .eq("duplicate_of_id", assetId);

  if (error) throw new SourceAssetRepositoryError(storageError(error.code));
  return (data ?? []).map((asset) => asset.storage_path);
}

// Goes through the RPC because `duplicate_of_id` is ON DELETE RESTRICT — a
// plain delete fails on any asset that has duplicates, and the user has no way
// to see or clear them.
// Takes no userId: the RPC scopes to `auth.uid()` itself, so accepting one
// would suggest a scope this function does not actually apply.
export async function deleteAsset(assetId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_owned_source_asset", {
    target_asset_id: assetId,
  });

  if (error) throw new SourceAssetRepositoryError(deleteError(error.code));
}
