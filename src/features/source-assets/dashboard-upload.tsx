"use client";

import { useRouter } from "next/navigation";

import type { Dictionary } from "@/i18n/dictionaries/en";

import { UploadForm } from "./upload-form";

export function DashboardUpload({ copy }: { copy: Dictionary["resume"] }) {
  const router = useRouter();
  return (
    <UploadForm copy={copy} onExtractionComplete={() => router.refresh()} />
  );
}
