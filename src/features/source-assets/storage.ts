import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { ResumeContentType } from "./schemas";

const bucket = "resume-sources";

type UploadSourceInput = {
  userId: string;
  assetId: string;
  extension: "pdf" | "docx";
  buffer: Buffer;
  contentType: ResumeContentType;
};

export class SourceStorageError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SourceStorageError";
  }
}

export async function uploadSource(input: UploadSourceInput) {
  const path = `${input.userId}/${input.assetId}/source.${input.extension}`;
  const supabase = await createClient();
  const { error } = await supabase.storage.from(bucket).upload(path, input.buffer, {
    contentType: input.contentType,
    upsert: false,
  });

  if (error) throw new SourceStorageError("source-upload-failed");
  return path;
}

export async function downloadSource(storagePath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(storagePath);

  if (error) throw new SourceStorageError("source-download-failed");
  return data;
}

export async function createSourceDownloadUrl(storagePath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60);

  if (error || !data.signedUrl) {
    throw new SourceStorageError("source-signing-failed");
  }
  return data.signedUrl;
}

export async function removeSources(storagePaths: string[]) {
  if (storagePaths.length === 0) return;

  const supabase = await createClient();
  const { error } = await supabase.storage.from(bucket).remove(storagePaths);
  if (error) throw new SourceStorageError("source-removal-failed");
}
