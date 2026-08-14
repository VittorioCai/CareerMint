import JSZip from "jszip";

type OwnedRecord = { userId: string };
type ExportAsset = OwnedRecord & {
  id: string;
  originalName: string;
  contentType?: string;
  storagePath: string;
  sizeBytes?: number;
  sha256?: string;
  status?: string;
  createdAt?: string;
};

export type AccountExportDependencies = {
  getProfile(userId: string): Promise<OwnedRecord | null>;
  listFacts(userId: string): Promise<OwnedRecord[]>;
  listAssets(userId: string): Promise<ExportAsset[]>;
  download(storagePath: string): Promise<Blob>;
};

function safeFilename(originalName: string) {
  const basename = originalName.replaceAll("\\", "/").split("/").pop() ?? "";
  const sanitized = basename
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "-")
    .trim();
  return sanitized || "source-file";
}

function publicAssetMetadata(asset: ExportAsset) {
  return {
    id: asset.id,
    originalName: asset.originalName,
    contentType: asset.contentType ?? null,
    sizeBytes: asset.sizeBytes ?? null,
    sha256: asset.sha256 ?? null,
    status: asset.status ?? null,
    createdAt: asset.createdAt ?? null,
  };
}

export async function buildAccountExport(
  userId: string,
  dependencies: AccountExportDependencies,
): Promise<Buffer> {
  const [profile, allFacts, allAssets] = await Promise.all([
    dependencies.getProfile(userId),
    dependencies.listFacts(userId),
    dependencies.listAssets(userId),
  ]);
  const ownedProfile = profile?.userId === userId ? profile : null;
  const facts = allFacts.filter((fact) => fact.userId === userId);
  const assets = allAssets.filter((asset) => asset.userId === userId);
  const zip = new JSZip();

  zip.file(
    "profile.json",
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        profile: ownedProfile,
        facts,
      },
      null,
      2,
    ),
  );
  zip.file(
    "source-assets.json",
    JSON.stringify(assets.map(publicAssetMetadata), null, 2),
  );

  for (const asset of assets) {
    const blob = await dependencies.download(asset.storagePath);
    zip.file(
      `files/${asset.id}/${safeFilename(asset.originalName)}`,
      Buffer.from(await blob.arrayBuffer()),
    );
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
