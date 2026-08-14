import JSZip from "jszip";

type OwnedRecord = { userId: string };
type OwnedApplication = OwnedRecord & { id: string };
type ApplicationChildRecord = { applicationId: string };
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
  listApplications(userId: string): Promise<OwnedApplication[]>;
  listApplicationEvents(
    userId: string,
    applicationId: string,
  ): Promise<Array<OwnedRecord & ApplicationChildRecord>>;
  listAnalysisRuns(
    userId: string,
  ): Promise<Array<OwnedRecord & ApplicationChildRecord>>;
  listRequirements(
    userId: string,
    applicationId: string,
  ): Promise<ApplicationChildRecord[]>;
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
  const [profile, allFacts, allAssets, allApplications, allAnalysisRuns] =
    await Promise.all([
    dependencies.getProfile(userId),
    dependencies.listFacts(userId),
    dependencies.listAssets(userId),
      dependencies.listApplications(userId),
      dependencies.listAnalysisRuns(userId),
    ]);
  const ownedProfile = profile?.userId === userId ? profile : null;
  const facts = allFacts.filter((fact) => fact.userId === userId);
  const assets = allAssets.filter((asset) => asset.userId === userId);
  const applications = allApplications.filter(
    (application) => application.userId === userId,
  );
  const applicationIds = new Set(
    applications.map((application) => application.id),
  );
  const analysisRuns = allAnalysisRuns.filter(
    (run) => run.userId === userId && applicationIds.has(run.applicationId),
  );
  const [eventGroups, requirementGroups] = await Promise.all([
    Promise.all(
      applications.map((application) =>
        dependencies.listApplicationEvents(userId, application.id),
      ),
    ),
    Promise.all(
      applications.map((application) =>
        dependencies.listRequirements(userId, application.id),
      ),
    ),
  ]);
  const stageEvents = eventGroups
    .flat()
    .filter(
      (event) =>
        event.userId === userId && applicationIds.has(event.applicationId),
    );
  const requirements = requirementGroups
    .flat()
    .filter((requirement) => applicationIds.has(requirement.applicationId));
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
  zip.file(
    "application-workspaces.json",
    JSON.stringify(
      { applications, stageEvents, analysisRuns, requirements },
      null,
      2,
    ),
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
