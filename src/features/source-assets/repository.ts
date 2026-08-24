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

export async function deleteAsset(
  userId: string,
  assetId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("source_assets")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", assetId);

  if (error) throw new SourceAssetRepositoryError(storageError(error.code));
  if (count === 0) {
    throw new SourceAssetRepositoryError("source-asset-not-found");
  }
}
