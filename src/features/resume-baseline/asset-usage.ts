import type { Database } from "@/lib/supabase/database.types";

// Derived from the generated enum rather than hand-copied, so it cannot drift
// from the database. Pure type import, safe from a client component.
export type SourceAssetStatus =
  Database["public"]["Enums"]["source_asset_status"];

export type AssetUsage = {
  applicationCount: number;
  confirmedFactCount: number;
};

// What a user loses by deleting an uploaded resume, so the confirmation panel
// can say it before they commit rather than after. Unconfirmed facts are left
// out on purpose: they are not yet the user's own work, so naming them would
// overstate the cost.
export function summarizeAssetUsage({
  applications,
  facts,
}: {
  applications: readonly { resumeSourceAssetId: string | null }[];
  facts: readonly {
    sourceAssetId: string | null;
    confirmationStatus: string;
  }[];
}): Map<string, AssetUsage> {
  const usage = new Map<string, AssetUsage>();

  function entry(assetId: string) {
    const existing = usage.get(assetId);
    if (existing) return existing;
    const created = { applicationCount: 0, confirmedFactCount: 0 };
    usage.set(assetId, created);
    return created;
  }

  for (const application of applications) {
    if (!application.resumeSourceAssetId) continue;
    entry(application.resumeSourceAssetId).applicationCount += 1;
  }

  for (const fact of facts) {
    if (!fact.sourceAssetId) continue;
    if (fact.confirmationStatus !== "confirmed") continue;
    entry(fact.sourceAssetId).confirmedFactCount += 1;
  }

  return usage;
}
