import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computePaperNumbers, PAPER_SNAPSHOT_DATE } from "./paperNumbers";
import committed from "../paper/paper_numbers.json";
import incomeTaxLookup from "../data/income_tax_lookup.json";
import metadata from "../data/billionaire_metadata.json";
import rosterRows from "../public/snapshots/2026-01-01.json";
import rosterValuations from "../paper/data/roster_valuations_2026-09-17.json";
import snapshotRows from "../public/snapshots/2026-09-17.json";

const paper = readFileSync(
  new URL("../paper/california-wealth-tax-ssrn-draft.qmd", import.meta.url),
  "utf8"
).replace(/\s+/g, " ");

describe("paper numbers", () => {
  const numbers = computePaperNumbers({
    rosterRows,
    snapshotRows,
    rosterValuations,
    metadata,
    incomeTaxLookup,
  });

  it("match the committed paper_numbers.json (rerun scripts/paper_numbers.mjs)", () => {
    expect(numbers).toEqual(committed);
    expect(numbers.snapshotDate).toBe(PAPER_SNAPSHOT_DATE);
  });

  it("appear in the manuscript exactly as computed", () => {
    const quoted = [
      `${numbers.baselinePeople} people`,
      `$${numbers.baselineGrossB} billion`,
      `$${numbers.baselineAfterTenPercentErosionB} billion`,
      `$${numbers.realEstateExclusionTaxB} billion`,
      `${numbers.newEntrantPeople} people`,
      `$${numbers.newEntrantWealthB} billion`,
      `$${numbers.adjustedGrossB} billion`,
      `$${numbers.residencyAdjustmentsTaxB} billion`,
      `$${numbers.adjustedAnnualIncomeTaxLostB} billion`,
      `$${numbers.adjustedPvReceiptsB} billion`,
      `$${numbers.adjustedPvIncomeTaxLostB} billion`,
      `$${numbers.adjustedNetB} billion`,
    ];

    for (const text of quoted) {
      expect(paper, `manuscript should contain "${text}"`).toContain(text);
    }
  });

  it("finds nobody in the rate ramp, so the ramp is worth nothing today", () => {
    expect(numbers.peopleInRateRamp).toBe(0);
  });
});
