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
import { INCOME_TAX_METHODS, snapshotSourceDate } from "./microModel";
import { BASELINE_ASSUMPTIONS, HOOVER_ASSUMPTIONS } from "./presets";
import { scoreScenario } from "./scenario";
import {
  RESIDENCY_ADJUSTMENTS,
  RESIDENCY_ROSTER_DATE,
  residencyExcludedNamesFromIds,
} from "./residencyAdjustments";

export const PAPER_SNAPSHOT_DATE = "2026-10-23";
// Annual California income tax the paper nets against receipts on the
// adjusted base, besides the model's own: the Legislative Analyst's "less
// than $1 billion per year" and Walczak's income-tax line ($3.09 billion in
// his larger scenario; his $4.49 billion total adds sales tax and spillovers).
export const LAO_INCOME_TAX_CEILING_B = 1;
export const WALCZAK_INCOME_TAX_B = 3.09;
// Shares of the cohort's income tax lost that the paper scores the Hoover set
// at: the ends and center of Jaros and Rauh's f ~ U[0.30, 0.60].
export const HOOVER_DEPARTURE_SHARES = [
  0.3,
  HOOVER_ASSUMPTIONS.incomeTaxDepartureShare,
  0.6,
];
// Jaros and Rauh's own figures (chapter c15504): the recognized base, after
// their departures, pre-filing exits, Zuckerberg and the international
// billionaires (§4.4, eq. 5); the $72B ceiling, with Zuckerberg and the
// pre-filing exits in, that their net present value section ties to full
// litigation survival (§4.4, §5.3); and the centers of their f and C ranges with
// r − g = 3% (§5.2–5.3). The paper sets their point net present values at a
// survival probability of 1 beside the calculator's.
export const JAROS_RAUH_RECOGNIZED_BASE_B = 59.15;
export const JAROS_RAUH_CEILING_B = 72;
export const JAROS_RAUH_CENTRAL_DEPARTURE_SHARE = 0.45;
export const JAROS_RAUH_CENTRAL_INCOME_TAX_B = 4.55;
export const JAROS_RAUH_CENTRAL_NET_DISCOUNT_RATE = 0.03;
const JAROS_RAUH_CENTRAL_INCOME_TAX_LOST_PV_B =
  (JAROS_RAUH_CENTRAL_DEPARTURE_SHARE * JAROS_RAUH_CENTRAL_INCOME_TAX_B) /
  JAROS_RAUH_CENTRAL_NET_DISCOUNT_RATE;
// The paper snapshot's date at midnight UTC, the clock VALUATION_DATE uses, so
// growth to the valuation date does not depend on the machine's time zone.
export const PAPER_SOURCE_DATE = snapshotSourceDate(PAPER_SNAPSHOT_DATE);

export const PAPER_STAGE_TWO_ASSUMPTIONS = {
  incomeYieldRate: 0.02,
  incomeTaxAttributionRate: 1,
  discountRate: 0.03,
  inflationRate: 0,
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
  const sourceDate = PAPER_SOURCE_DATE;
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
  // The calculator's Hoover set, which follows Jaros and Rauh's NBER version,
  // under each division of the cohort's income tax.
  const bridge = berkeleyToHooverBridge(score, HOOVER_ASSUMPTIONS);
  const hoover = score(HOOVER_ASSUMPTIONS);
  const hooverFromFilings = score({
    ...HOOVER_ASSUMPTIONS,
    incomeTaxMethod: INCOME_TAX_METHODS.FILINGS,
  });
  const documentedSharePct = (scored) =>
    round((100 * scored.micro.knownDepartureIncomeTaxB) / scored.micro.cohortIncomeTaxTotalB);
  // The same rows the allocation divides the total across, so each person's
  // share times the total equals their by-wealth dollars.
  const cohortWealthB = hoover.micro.rows
    .filter((row) => row.inIncomeTaxCohort)
    .reduce((sum, row) => sum + row.netWorthB, 0);
  const fourLargest = ["Larry Page", "Sergey Brin", "Mark Zuckerberg", "Jensen Huang"].map(
    (name) => {
      const byWealth = hoover.micro.rows.find((row) => row.name === name);
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
    newEntrantNonCitizenPeople: baseline.baseNotes.assumedResidencyNonCitizenCount,
    newEntrantNonCitizenWealthB: round(baseline.baseNotes.assumedResidencyNonCitizenWealthB, 0),
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
    installmentPvAtTwoPercentInflationPer100: round(calculateFiscalImpact({
      grossWealthTaxB: 100,
      avoidanceRate: 0,
      discountRate: 0.03,
      inflationRate: 0.02,
      wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS,
    }).pvWealthTaxReceipts, 2),
    hooverCollectedB: round(hoover.result.wealthTaxCollected),
    hooverPvReceiptsB: round(hoover.result.pvWealthTaxReceipts, 2),
    hooverAnnualIncomeTaxLostB: round(hoover.result.annualIncomeTaxLost, 2),
    hooverPvIncomeTaxLostB: round(hoover.result.pvLostIncomeTax, 2),
    hooverDocumentedIncomeTaxSharePct: documentedSharePct(hoover),
    hooverDocumentedIncomeTaxShareFromFilingsPct: documentedSharePct(hooverFromFilings),
    hooverDepartureShareSweep: HOOVER_DEPARTURE_SHARES.map((share) => ({
      sharePct: Math.round(share * 100),
      byWealthB: round(
        score({ ...HOOVER_ASSUMPTIONS, incomeTaxDepartureShare: share }).result
          .netFiscalImpact
      ),
      fromFilingsB: round(
        score({
          ...HOOVER_ASSUMPTIONS,
          incomeTaxDepartureShare: share,
          incomeTaxMethod: INCOME_TAX_METHODS.FILINGS,
        }).result.netFiscalImpact
      ),
    })),
    hooverAtFullSurvivalB: round(
      score({ ...HOOVER_ASSUMPTIONS, litigationSurvivalRate: 1 }).result.netFiscalImpact
    ),
    jarosRauhRecognizedBaseAtFullSurvivalB: round(
      JAROS_RAUH_RECOGNIZED_BASE_B - JAROS_RAUH_CENTRAL_INCOME_TAX_LOST_PV_B
    ),
    jarosRauhCeilingAtFullSurvivalB: round(
      JAROS_RAUH_CEILING_B - JAROS_RAUH_CENTRAL_INCOME_TAX_LOST_PV_B
    ),
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
// Table rows, largest effect first; the test collapses whitespace before
// matching, so the rows must be consecutive in the manuscript.
const bridgeRows = (steps) =>
  [...steps]
    .sort((a, b) => Math.abs(b.valueB) - Math.abs(a.valueB))
    .map(
      (step) =>
        `| ${step.label} | ${signed(step.valueB)} | ${signed(step.minB)} to ${signed(step.maxB)} |`
    )
    .join(" ");

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
    newEntrantNonCitizenPeople: `${numbers.newEntrantNonCitizenPeople} of them are not US citizens`,
    newEntrantNonCitizenWealthB: `${billions(numbers.newEntrantNonCitizenWealthB)} between them`,
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
    adjustedNetAtWalczakIncomeTaxB: `Walczak's $${WALCZAK_INCOME_TAX_B} billion of income tax it is ${billions(numbers.adjustedNetAtWalczakIncomeTaxB)}`,
    installmentReceiptsPer100: `$${numbers.installmentReceiptsPer100} in nominal receipts`,
    installmentPvAtTwoPercentInflationPer100: `$${numbers.installmentPvAtTwoPercentInflationPer100.toFixed(2)} per $100 of liability`,
    hooverCollectedB: `collects ${billions(numbers.hooverCollectedB)}`,
    hooverPvReceiptsB: billions(numbers.hooverPvReceiptsB),
    hooverAnnualIncomeTaxLostB: `${billions(numbers.hooverAnnualIncomeTaxLostB)} a year`,
    hooverPvIncomeTaxLostB: billions(numbers.hooverPvIncomeTaxLostB),
    hooverDocumentedIncomeTaxSharePct: `${numbers.hooverDocumentedIncomeTaxSharePct} percent of the cohort's income tax divided by wealth`,
    hooverDocumentedIncomeTaxShareFromFilingsPct: `${numbers.hooverDocumentedIncomeTaxShareFromFilingsPct} percent with the filings-based estimates`,
    hooverDepartureShareSweep: numbers.hooverDepartureShareSweep
      .map(
        (row) =>
          `| ${row.sharePct} percent | ${billions(row.byWealthB)} | ${billions(row.fromFilingsB)} |`
      )
      .join(" "),
    hooverAtFullSurvivalB: `with survival certain it gives ${signed(numbers.hooverAtFullSurvivalB)} billion`,
    jarosRauhRecognizedBaseAtFullSurvivalB: `about ${billions(numbers.jarosRauhRecognizedBaseAtFullSurvivalB)} on their recognized base`,
    jarosRauhCeilingAtFullSurvivalB: `about ${signed(numbers.jarosRauhCeilingAtFullSurvivalB)} billion on the $72 billion ceiling`,
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
    bridge: bridgeRows(numbers.bridge),
  };
}
