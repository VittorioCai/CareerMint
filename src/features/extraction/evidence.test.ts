import { describe, expect, it } from "vitest";

import { verifyCandidateEvidence } from "./evidence";

const source =
  "Product Analyst\nImproved checkout conversion by 18% through funnel analysis.";

describe("verifyCandidateEvidence", () => {
  it("accepts an excerpt present after whitespace normalization", () => {
    expect(
      verifyCandidateEvidence(
        source,
        "Improved checkout conversion by 18% through funnel analysis.",
      ),
    ).toBe(true);
  });

  it("rejects invented metrics", () => {
    expect(
      verifyCandidateEvidence(source, "Improved conversion by 35%"),
    ).toBe(false);
  });

  it("folds NEL and BOM as ordinary Unicode whitespace", () => {
    expect(
      verifyCandidateEvidence(
        "Lead\u0085product\uFEFFdiscovery across markets.",
        "lead product discovery across markets.",
      ),
    ).toBe(true);
  });

  it("counts the evidence minimum in Unicode code points", () => {
    const sixEmoji = "😀".repeat(6);
    const twelveEmoji = "😀".repeat(12);

    expect(verifyCandidateEvidence(`before ${sixEmoji} after`, sixEmoji)).toBe(
      false,
    );
    expect(
      verifyCandidateEvidence(`before ${twelveEmoji} after`, twelveEmoji),
    ).toBe(true);
  });
});
