import { describe, expect, it } from "vitest";

import { summarizeAssetUsage } from "./asset-usage";

const assetA = "11111111-1111-4111-8111-111111111111";
const assetB = "22222222-2222-4222-8222-222222222222";

describe("summarizeAssetUsage", () => {
  it("counts the applications and confirmed facts that point at each asset", () => {
    const usage = summarizeAssetUsage({
      applications: [
        { resumeSourceAssetId: assetA },
        { resumeSourceAssetId: assetA },
        { resumeSourceAssetId: assetB },
      ],
      facts: [
        { sourceAssetId: assetA, confirmationStatus: "confirmed" },
        { sourceAssetId: assetB, confirmationStatus: "confirmed" },
        { sourceAssetId: assetB, confirmationStatus: "confirmed" },
        { sourceAssetId: assetB, confirmationStatus: "confirmed" },
      ],
    });

    expect(usage.get(assetA)).toEqual({ applicationCount: 2, confirmedFactCount: 1 });
    expect(usage.get(assetB)).toEqual({ applicationCount: 1, confirmedFactCount: 3 });
  });

  it("counts only confirmed facts, since unconfirmed ones are not the user's work yet", () => {
    const usage = summarizeAssetUsage({
      applications: [],
      facts: [
        { sourceAssetId: assetA, confirmationStatus: "confirmed" },
        { sourceAssetId: assetA, confirmationStatus: "pending" },
        { sourceAssetId: assetA, confirmationStatus: "needs_detail" },
      ],
    });

    expect(usage.get(assetA)).toEqual({ applicationCount: 0, confirmedFactCount: 1 });
  });

  it("ignores rows that point at no asset", () => {
    const usage = summarizeAssetUsage({
      applications: [{ resumeSourceAssetId: null }],
      facts: [{ sourceAssetId: null, confirmationStatus: "confirmed" }],
    });

    expect(usage.size).toBe(0);
  });

  it("reports zeros for an asset nothing references", () => {
    const usage = summarizeAssetUsage({ applications: [], facts: [] });

    expect(usage.get(assetA)).toBeUndefined();
  });
});
