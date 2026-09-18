/**
 * Every number quoted in paper/california-wealth-tax-ssrn-draft.qmd, computed
 * from a dated snapshot with the same functions the calculator runs.
 * scripts/paper_numbers.mjs writes the result to paper/paper_numbers.json and
 * lib/paperNumbers.test.js fails when the paper and the code disagree.
 */
import {
  buildWealthTaxReceiptSchedule,
  calculateFiscalImpact,
  WEALTH_TAX_PAYMENT_MODES,
} from "./calculator";
import { berkeleyToHooverBridge } from "./bridge";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  computeMicroResults,
} from "./microModel";
import { INCOME_TAX_METHODS } from "./microModel";
import { BASELINE_ASSUMPTIONS, HOOVER_ASSUMPTIONS } from "./presets";
import { scoreScenario } from "./scenario";
import {
  RESIDENCY_ADJUSTMENTS,
  RESIDENCY_ROSTER_DATE,
  residencyExcludedNamesFromIds,
} from "./residencyAdjustments";

export const PAPER_SNAPSHOT_DATE = "2026-09-18";
// Annual California income tax the paper nets against receipts on the
// adjusted base, besides the model's own: the Legislative Analyst's "less
// than $1 billion per year" and Walczak's income-tax line ($3.09 billion in
// his larger scenario; his $4.49 billion total adds sales tax and spillovers).
export const LAO_INCOME_TAX_CEILING_B = 1;
export const WALCZAK_INCOME_TAX_B = 3.09;
export const PAPER_STAGE_TWO_ASSUMPTIONS = {
  incomeYieldRate: 0.02,
  incomeTaxAttributionRate: 1,
  discountRate: 0.03,
  wealthGrowthRate: 0,
  incomeGrowthRate: 0,
  annualReturnRate: 0,
  horizonYears: Infinity,
};

const round = (value, digits = 1) => {
  const rounded = Number(value.toFixed(digits));
  // -0 survives toFixed and fails a deep-equality check against the JSON.
  return rounded === 0 ? 0 : rounded;
};

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
  // Every documented claim treated as effective: eight remove someone from
  // the base, four keep the person in the base and count their income tax as
  // lost. Stage two on, with the paper's stated assumptions.
  const allAdjustmentIds = RESIDENCY_ADJUSTMENTS.map((adjustment) => adjustment.id);
  const baseExclusionNames = residencyExcludedNamesFromIds(allAdjustmentIds);
  const adjustedScenario = scoreScenario({
    params: {
      ...BASELINE_ASSUMPTIONS,
      ...PAPER_STAGE_TWO_ASSUMPTIONS,
      residencyExclusionIds: allAdjustmentIds,
      includeIncomeTaxEffects: true,
    },
    rows,
    incomeTaxLookup,
    sourceDate,
  });
  const adjusted = adjustedScenario.micro;
  const adjustedImpact = adjustedScenario.result;
  const netAtAnnualLoss = (annualIncomeTaxB) =>
    calculateFiscalImpact({
      grossWealthTaxB: adjusted.grossWealthTaxB,
      avoidanceRate: 0,
      moverIncomeTaxB: annualIncomeTaxB,
      includeIncomeTaxEffects: true,
      ...PAPER_STAGE_TWO_ASSUMPTIONS,
    }).netFiscalImpact;
  const baseWealthB = (result) =>
    result.wealthTaxBaseRows.reduce((sum, row) => sum + row.netWorthB, 0);
  const inRampBand = baseline.wealthTaxBaseRows.filter(
    (row) => row.rate > 0 && row.rate < 0.05
  );
  const rampCostB = inRampBand.reduce(
    (sum, row) => sum + row.taxableWealthB * (0.05 - row.rate),
    0
  );
  const topFourWealthB = [...baseline.wealthTaxBaseRows]
    .sort((a, b) => b.netWorthB - a.netWorthB)
    .slice(0, 4)
    .reduce((sum, row) => sum + row.netWorthB, 0);
  const baselineCohortIncomeTaxB = baseline.rawForbesRows
    .filter((row) => row.inBase)
    .reduce((sum, row) => sum + row.annualIncomeTaxB, 0);
  const installmentReceiptsPer100 = buildWealthTaxReceiptSchedule({
    wealthTaxCollected: 100,
    paymentMode: WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS,
  }).reduce((sum, entry) => sum + entry.receipt, 0);
  const score = (params) =>
    scoreScenario({ params, rows, incomeTaxLookup, sourceDate });
  const bridge = berkeleyToHooverBridge(score);
  // The Hoover assumptions with one change: the four largest fortunes pay what
  // their filings show instead of their wealth share of the cohort total.
  const hooverFromFilings = score({
    ...HOOVER_ASSUMPTIONS,
    incomeTaxMethod: INCOME_TAX_METHODS.FILINGS,
  });
  const hooverByWealth = score(HOOVER_ASSUMPTIONS);
  const cohortWealthB = hooverByWealth.micro.rows
    .filter((row) => row.includeInRawForbes && row.netWorthB > 0)
    .reduce((sum, row) => sum + row.netWorthB, 0);
  const fourLargest = ["Larry Page", "Sergey Brin", "Mark Zuckerberg", "Jensen Huang"].map(
    (name) => {
      const byWealth = hooverByWealth.micro.rows.find((row) => row.name === name);
      const fromFilings = hooverFromFilings.micro.rows.find((row) => row.name === name);

      return {
        name,
        wealthSharePct: round((100 * byWealth.netWorthB) / cohortWealthB),
        byWealthM: Math.round(byWealth.annualIncomeTaxB * 1000),
        fromFilingsM: Math.round(fromFilings.annualIncomeTaxB * 1000),
      };
    }
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
    rateRampCostB: round(rampCostB, 2),
    topFourWealthSharePercent: round(
      (100 * topFourWealthB) / baseWealthB(baseline),
      0
    ),
    newEntrantPeople: baseline.baseNotes.assumedResidencyCount,
    newEntrantWealthB: round(baseline.baseNotes.assumedResidencyWealthB, 0),
    movedPerForbesPeople: baseline.baseNotes.anyStateValuedCount,
    lastListedPeople: baseline.baseNotes.lastListedCount,
    lastListedWealthB: round(baseline.baseNotes.lastListedWealthB, 0),
    belowThresholdPeople: baseline.baseNotes.belowThresholdCount,
    excludedFromEveryBase: rosterRows.filter(
      (row) => metadata.byName[row.name]?.includeInRawForbes === false
    ).length,
    residencyAdjustmentCount: allAdjustmentIds.length,
    baseExclusionCount: baseExclusionNames.length,
    adjustedPeople: adjusted.wealthTaxBaseRows.length,
    adjustedGrossB: round(adjusted.grossWealthTaxB),
    residencyAdjustmentsTaxB: round(
      baseline.grossWealthTaxB - adjusted.grossWealthTaxB
    ),
    baselineCohortIncomeTaxAtDefaultYieldB: round(baselineCohortIncomeTaxB),
    adjustedAnnualIncomeTaxLostB: round(adjustedImpact.annualIncomeTaxLost, 2),
    adjustedPvReceiptsB: round(adjustedImpact.pvWealthTaxReceipts),
    adjustedPvIncomeTaxLostB: round(adjustedImpact.pvLostIncomeTax),
    adjustedNetB: round(adjustedImpact.netFiscalImpact),
    adjustedNetAtLaoCeilingB: round(netAtAnnualLoss(LAO_INCOME_TAX_CEILING_B)),
    adjustedNetAtWalczakIncomeTaxB: round(netAtAnnualLoss(WALCZAK_INCOME_TAX_B)),
    installmentReceiptsPer100: round(installmentReceiptsPer100, 0),
    hooverAnnualIncomeTaxLostB: round(hooverByWealth.result.annualIncomeTaxLost, 2),
    hooverFromFilingsAnnualIncomeTaxLostB: round(
      hooverFromFilings.result.annualIncomeTaxLost,
      2
    ),
    hooverFromFilingsNetB: round(hooverFromFilings.result.netFiscalImpact),
    fourLargestWealthSharePct: round(
      fourLargest.reduce((sum, person) => sum + person.wealthSharePct, 0)
    ),
    fourLargestByWealthM: fourLargest.reduce((sum, person) => sum + person.byWealthM, 0),
    fourLargestFromFilingsM: fourLargest.reduce(
      (sum, person) => sum + person.fromFilingsM,
      0
    ),
    fourLargest,
    bridgeStartB: round(bridge.startValue),
    bridgeEndB: round(bridge.endValue),
    bridge: bridge.contributions.map((step) => ({
      id: step.id,
      label: step.label,
      valueB: round(step.value),
      minB: round(step.min),
      maxB: round(step.max),
    })),
  };
}

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

export function numberWord(value, { capitalize = false } = {}) {
  const word = NUMBER_WORDS[value] ?? String(value);
  return capitalize ? word[0].toUpperCase() + word.slice(1) : word;
}

const billions = (value) =>
  `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US")} billion`;
const signed = (value) => `${value < 0 ? "-" : "+"}$${Math.abs(value).toFixed(1)}`;

/**
 * The exact string the manuscript must contain for each figure it quotes,
 * keyed by the field of `computePaperNumbers` it comes from.
 * lib/paperNumbers.test.js checks each against the text and that every field
 * has one.
 */
export function longDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const monthName = new Date(Date.UTC(year, month - 1, day)).toLocaleString(
    "en-US",
    { month: "long", timeZone: "UTC" }
  );
  return `${monthName} ${day}, ${year}`;
}

export function manuscriptStrings(numbers) {
  const word = (value) => numberWord(value, { capitalize: true });
  const snapshotDate = longDate(numbers.snapshotDate);

  return {
    baselinePeople: `${numbers.baselinePeople} people`,
    baselineWealthB: billions(numbers.baselineWealthB),
    baselineGrossB: billions(numbers.baselineGrossB),
    baselineAfterTenPercentErosionB: billions(
      numbers.baselineAfterTenPercentErosionB
    ),
    realEstateExclusionTaxB: billions(numbers.realEstateExclusionTaxB),
    peopleInRateRamp: `${word(numbers.peopleInRateRamp)} people on the ${snapshotDate} roster`,
    rateRampCostB: billions(numbers.rateRampCostB),
    topFourWealthSharePercent: `${numbers.topFourWealthSharePercent} percent of the base`,
    newEntrantPeople: `${numbers.newEntrantPeople} people in this group`,
    newEntrantWealthB: billions(numbers.newEntrantWealthB),
    movedPerForbesPeople: `${word(numbers.movedPerForbesPeople)} roster members Forbes now places in another state`,
    lastListedPeople: `${word(numbers.lastListedPeople)} roster members Forbes no longer lists`,
    lastListedWealthB: billions(numbers.lastListedWealthB),
    belowThresholdPeople: `${word(numbers.belowThresholdPeople)} people on the current California list`,
    excludedFromEveryBase: `${word(numbers.excludedFromEveryBase)} roster member is excluded from every base`,
    residencyAdjustmentCount: `${word(numbers.residencyAdjustmentCount)} documented departure claims`,
    baseExclusionCount: `${word(numbers.baseExclusionCount)} remove a person from the base`,
    adjustedPeople: `${numbers.adjustedPeople} people`,
    adjustedGrossB: billions(numbers.adjustedGrossB),
    residencyAdjustmentsTaxB: billions(numbers.residencyAdjustmentsTaxB),
    baselineCohortIncomeTaxAtDefaultYieldB: `${billions(numbers.baselineCohortIncomeTaxAtDefaultYieldB)} a year`,
    adjustedAnnualIncomeTaxLostB: billions(numbers.adjustedAnnualIncomeTaxLostB),
    adjustedPvReceiptsB: billions(numbers.adjustedPvReceiptsB),
    adjustedPvIncomeTaxLostB: billions(numbers.adjustedPvIncomeTaxLostB),
    adjustedNetB: billions(numbers.adjustedNetB),
    adjustedNetAtLaoCeilingB: billions(numbers.adjustedNetAtLaoCeilingB),
    adjustedNetAtWalczakIncomeTaxB: billions(numbers.adjustedNetAtWalczakIncomeTaxB),
    installmentReceiptsPer100: `$${numbers.installmentReceiptsPer100} in nominal receipts`,
    hooverAnnualIncomeTaxLostB: billions(numbers.hooverAnnualIncomeTaxLostB),
    hooverFromFilingsAnnualIncomeTaxLostB: `${billions(numbers.hooverFromFilingsAnnualIncomeTaxLostB)} a year`,
    hooverFromFilingsNetB: billions(numbers.hooverFromFilingsNetB),
    fourLargestWealthSharePct: `${numbers.fourLargestWealthSharePct} percent of the cohort's wealth`,
    fourLargestByWealthM: `$${numbers.fourLargestByWealthM.toLocaleString("en-US")} million`,
    fourLargestFromFilingsM: `$${numbers.fourLargestFromFilingsM.toLocaleString("en-US")} million`,
    fourLargest: numbers.fourLargest
      .map(
        (person) =>
          `| ${person.name} | ${person.wealthSharePct}% | $${person.byWealthM} million | $${person.fromFilingsM} million |`
      )
      .join(" "),
    bridgeStartB: billions(numbers.bridgeStartB),
    bridgeEndB: billions(numbers.bridgeEndB),
    // The table rows, largest effect first; the test collapses whitespace
    // before matching, so the rows must be consecutive in the manuscript.
    bridge: [...numbers.bridge]
      .sort((a, b) => Math.abs(b.valueB) - Math.abs(a.valueB))
      .map(
        (step) =>
          `| ${step.label} | ${signed(step.valueB)} | ${signed(step.minB)} to ${signed(step.maxB)} |`
      )
      .join(" "),
  };
}
