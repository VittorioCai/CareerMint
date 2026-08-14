"use client";

import { useRouter } from "next/navigation";

import { UploadForm } from "./upload-form";

export function DashboardUpload() {
  const router = useRouter();
  return <UploadForm onExtractionComplete={() => router.refresh()} />;
}
