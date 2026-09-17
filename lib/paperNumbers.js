/**
 * Every number quoted in paper/california-wealth-tax-ssrn-draft.qmd, computed
 * from a dated snapshot with the same functions the calculator runs.
 * scripts/paper_numbers.mjs writes the result to paper/paper_numbers.json and
 * lib/paperNumbers.test.js fails when the paper and the code disagree.
 */
import { calculateFiscalImpact } from "./calculator";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  computeMicroResults,
} from "./microModel";
import {
  RESIDENCY_ADJUSTMENTS,
  RESIDENCY_ROSTER_DATE,
  residencyExcludedNamesFromIds,
} from "./residencyAdjustments";

export const PAPER_SNAPSHOT_DATE = "2026-09-17";
export const PAPER_STAGE_TWO_ASSUMPTIONS = {
  incomeYieldRate: 0.02,
  incomeTaxAttributionRate: 1,
  discountRate: 0.03,
  growthRate: 0,
  annualReturnRate: 0,
  horizonYears: Infinity,
};

const round = (value, digits = 1) => Number(value.toFixed(digits));

export function computePaperNumbers({
  rosterRows,
  snapshotRows,
  rosterValuations,
  metadata,
  incomeTaxLookup,
}) {
  const rows = buildResidencyRosterValuationRows({
    residencyRows: annotateBillionaires({
      billionaires: rosterRows,
      metadata,
      snapshotDate: RESIDENCY_ROSTER_DATE,
    }),
    valuationRows: annotateBillionaires({
      billionaires: snapshotRows,
      metadata,
      snapshotDate: PAPER_SNAPSHOT_DATE,
    }),
    rosterValuations,
    includeNewEntrants: true,
  });
  const sourceDate = new Date(`${PAPER_SNAPSHOT_DATE}T00:00:00`);
  const run = ({ excludedNames = [], excludeRealEstate = true }) =>
    computeMicroResults({
      billionaires: rows,
      incomeTaxLookup,
      excludedNames,
      excludeRealEstate,
      incomeYieldRate: PAPER_STAGE_TWO_ASSUMPTIONS.incomeYieldRate,
      sourceDate,
    });

  const baseline = run({});
  const baselineWithRealEstate = run({ excludeRealEstate: false });
  const allAdjustmentNames = residencyExcludedNamesFromIds(
    RESIDENCY_ADJUSTMENTS.map((adjustment) => adjustment.id)
  );
  const adjusted = run({ excludedNames: allAdjustmentNames });
  const adjustedImpact = calculateFiscalImpact({
    grossWealthTaxB: adjusted.grossWealthTaxB,
    avoidanceRate: 0,
    moverIncomeTaxB: adjusted.moverIncomeTaxB,
    includeIncomeTaxEffects: true,
    ...PAPER_STAGE_TWO_ASSUMPTIONS,
  });
  const baseWealthB = (result) =>
    result.wealthTaxBaseRows.reduce((sum, row) => sum + row.netWorthB, 0);
  const inRampBand = baseline.wealthTaxBaseRows.filter(
    (row) => row.rate > 0 && row.rate < 0.05
  );

  return {
    snapshotDate: PAPER_SNAPSHOT_DATE,
    baselinePeople: baseline.wealthTaxBaseRows.length,
    baselineWealthB: round(baseWealthB(baseline), 0),
    baselineGrossB: round(baseline.grossWealthTaxB),
    baselineAfterTenPercentErosionB: round(baseline.grossWealthTaxB * 0.9),
    realEstateExclusionTaxB: round(
      baselineWithRealEstate.grossWealthTaxB - baseline.grossWealthTaxB,
      2
    ),
    peopleInRateRamp: inRampBand.length,
    newEntrantPeople: baseline.baseNotes.assumedResidencyCount,
    newEntrantWealthB: round(baseline.baseNotes.assumedResidencyWealthB, 0),
    movedPerForbesPeople: baseline.baseNotes.anyStateValuedCount,
    offForbesListPeople: baseline.baseNotes.offForbesListCount,
    residencyAdjustmentCount: allAdjustmentNames.length,
    adjustedPeople: adjusted.wealthTaxBaseRows.length,
    adjustedGrossB: round(adjusted.grossWealthTaxB),
    residencyAdjustmentsTaxB: round(
      baseline.grossWealthTaxB - adjusted.grossWealthTaxB
    ),
    adjustedAnnualIncomeTaxLostB: round(adjustedImpact.annualIncomeTaxLost, 2),
    adjustedPvReceiptsB: round(adjustedImpact.pvWealthTaxReceipts),
    adjustedPvIncomeTaxLostB: round(adjustedImpact.pvLostIncomeTax),
    adjustedNetB: round(adjustedImpact.netFiscalImpact),
  };
}
