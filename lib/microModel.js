import { effectiveWealthTaxRate } from "./calculator";
import { estimateCaliforniaIncomeTaxB } from "./incomeTaxLookup";
import rauhData from "../data/billionaires_rauh.json";

export const VALUATION_DATE = new Date("2026-12-31");
export const MEDIAN_REAL_ESTATE_SHARE = 0.0064;
export const WEALTH_BASES = {
  ALL_FORBES: "allForbes",
  CORRECTED_BASE: "correctedBase",
  AFTER_PRE_SNAPSHOT_DEPARTURES: "afterPreSnapshotDepartures",
};

const KNOWN_REAL_ESTATE_NAMES = new Set(rauhData.map((row) => row.name));

function yearsBetween(from, to) {
  return (to - from) / (365.25 * 24 * 60 * 60 * 1000);
}

function mergeBillionaireMetadata(row, metadataByName) {
  const overrides = metadataByName?.[row.name] ?? {};

  return {
    ...row,
    includeInRawForbes: overrides.includeInRawForbes ?? row.includeInRawForbes ?? true,
    excludeFromCorrectedBase:
      overrides.excludeFromCorrectedBase ?? row.excludeFromCorrectedBase ?? false,
    departureTiming: overrides.departureTiming ?? row.departureTiming ?? null,
  };
}

export function annotateBillionaires({
  billionaires,
  metadata,
  snapshotDate,
}) {
  const metadataByName = metadata?.byName ?? {};
  const rows = billionaires.map((row) => mergeBillionaireMetadata(row, metadataByName));
  const existingNames = new Set(rows.map((row) => row.name));
  const syntheticRows = (metadata?.syntheticRowsBySnapshot?.[snapshotDate] ?? [])
    .filter((row) => !existingNames.has(row.name))
    .map((row) => mergeBillionaireMetadata(row, metadataByName));

  return [...rows, ...syntheticRows];
}

export function buildResidencyRosterValuationRows({
  residencyRows,
  valuationRows,
}) {
  const valuationByName = new Map(
    valuationRows.map((row) => [row.name, row])
  );

  return residencyRows
    .filter((row) => row.includeInRawForbes !== false)
    .map((residencyRow) => {
      const valuationRow = valuationByName.get(residencyRow.name);

      if (!valuationRow) {
        return {
          ...residencyRow,
          valuationFallback: true,
        };
      }

      return {
        ...valuationRow,
        includeInRawForbes: residencyRow.includeInRawForbes,
        excludeFromCorrectedBase: residencyRow.excludeFromCorrectedBase,
        departureTiming: residencyRow.departureTiming,
        valuationFallback: false,
      };
    });
}

export function getBillionaireFlags(row) {
  const includeInRawForbes = row.includeInRawForbes !== false;
  const excludeFromCorrectedBase = Boolean(row.excludeFromCorrectedBase);
  const departureTiming = row.departureTiming ?? null;
  const hasKnownDeparture = departureTiming !== null;
  const isPreSnapshotDeparture = departureTiming === "pre_snapshot";

  return {
    includeInRawForbes,
    excludeFromCorrectedBase,
    departureTiming,
    hasKnownDeparture,
    isPreSnapshotDeparture,
  };
}

function hasObservedRealEstate(row) {
  if (typeof row.realEstateObserved === "boolean") {
    return row.realEstateObserved;
  }

  if (typeof row.realEstateImputed === "boolean") {
    return !row.realEstateImputed;
  }

  if (row.realEstateSource === "observed") {
    return true;
  }

  if (row.realEstateSource === "imputed") {
    return false;
  }

  if (KNOWN_REAL_ESTATE_NAMES.has(row.name)) {
    return true;
  }

  return (row.realEstate ?? 0) > 0;
}

export function estimateRealEstateHoldingsB(row, growthFactor = 1) {
  const netWorthB = (row.netWorth / 1e9) * growthFactor;
  const observedRealEstateB = ((row.realEstate ?? 0) / 1e9) * growthFactor;
  const realEstateObserved = hasObservedRealEstate(row);
  const realEstateB = realEstateObserved
    ? observedRealEstateB
    : netWorthB * MEDIAN_REAL_ESTATE_SHARE;

  return {
    realEstateB,
    realEstateObserved,
    realEstateImputed: !realEstateObserved,
  };
}

/**
 * Compute per-billionaire and aggregate values from microdata.
 */
export function computeMicroResults({
  billionaires,
  incomeTaxLookup,
  wealthBase,
  excludedNames = [],
  excludeRealEstate,
  incomeYieldRate,
  wealthGrowthRate = 0,
  unannouncedDepartureShare = 0,
  sourceDate = new Date("2025-10-17"),
}) {
  const excludedNameSet = new Set(excludedNames);
  const usingExplicitExclusions = excludedNames.length > 0 || !wealthBase;
  const years = yearsBetween(sourceDate, VALUATION_DATE);
  const growthFactor =
    wealthGrowthRate > 0 ? Math.pow(1 + wealthGrowthRate, years) : 1;

  const rows = billionaires.map((b) => {
    const flags = getBillionaireFlags(b);
    const rawNetWorthB = b.netWorth / 1e9;
    const netWorthB = rawNetWorthB * growthFactor;
    const realEstateTreatment = estimateRealEstateHoldingsB(b, growthFactor);
    const realEstateB = realEstateTreatment.realEstateB;
    const excludedRealEstateB = excludeRealEstate ? realEstateB : 0;
    const taxableWealthB = Math.max(0, netWorthB - excludedRealEstateB);
    const rateBaseWealthB = excludeRealEstate ? taxableWealthB : netWorthB;
    const rate = effectiveWealthTaxRate(rateBaseWealthB);
    const grossTaxB = taxableWealthB * rate;
    const annualIncomeB = taxableWealthB * incomeYieldRate;
    const annualIncomeTaxB = estimateCaliforniaIncomeTaxB(
      annualIncomeB,
      incomeTaxLookup
    );
    const excludedFromWealthTaxBase = excludedNameSet.has(b.name);
    const inBase = usingExplicitExclusions
      ? flags.includeInRawForbes && !excludedFromWealthTaxBase
      : wealthBase === WEALTH_BASES.ALL_FORBES
        ? flags.includeInRawForbes
        : wealthBase === WEALTH_BASES.CORRECTED_BASE
          ? !flags.excludeFromCorrectedBase
          : !flags.excludeFromCorrectedBase && !flags.isPreSnapshotDeparture;
    const countsTowardKnownIncomeTaxLoss = usingExplicitExclusions
      ? flags.includeInRawForbes && flags.hasKnownDeparture
      : wealthBase === WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES &&
        !flags.excludeFromCorrectedBase &&
        flags.hasKnownDeparture;
    const eligibleForUnannouncedDeparture =
      inBase && !flags.hasKnownDeparture;

    return {
      name: b.name,
      moved: flags.hasKnownDeparture,
      inBase,
      excludedFromWealthTaxBase,
      includeInRawForbes: flags.includeInRawForbes,
      excludeFromCorrectedBase: flags.excludeFromCorrectedBase,
      departureTiming: flags.departureTiming,
      countsTowardKnownIncomeTaxLoss,
      eligibleForUnannouncedDeparture,
      netWorthB,
      realEstateB,
      realEstateImputed: realEstateTreatment.realEstateImputed,
      excludedRealEstateB,
      taxableWealthB,
      rate,
      grossTaxB,
      annualIncomeB,
      annualIncomeTaxB,
    };
  });

  const rawForbesRows = rows.filter((row) => row.includeInRawForbes);
  const correctedBaseRows =
    usingExplicitExclusions
      ? rawForbesRows.filter(
          (row) =>
            !row.excludedFromWealthTaxBase || row.departureTiming === "pre_snapshot"
        )
      : rows.filter((row) => !row.excludeFromCorrectedBase);
  const observedPreSnapshotDepartureRows =
    usingExplicitExclusions
      ? rawForbesRows.filter(
          (row) =>
            row.excludedFromWealthTaxBase &&
            row.departureTiming === "pre_snapshot"
        )
      : correctedBaseRows.filter((row) => row.departureTiming === "pre_snapshot");
  const observedPostSnapshotDepartureRows = correctedBaseRows.filter(
    (row) => row.departureTiming === "post_snapshot"
  );
  const observedUnconfirmedDepartureRows = correctedBaseRows.filter(
    (row) => row.departureTiming === "unconfirmed"
  );
  const wealthTaxBaseRows = rows.filter((row) => row.inBase);
  const remainingResidentRows = rows.filter((row) => row.eligibleForUnannouncedDeparture);
  const knownDepartureRows = rows.filter((row) => row.countsTowardKnownIncomeTaxLoss);
  const preSnapshotDepartureRows = knownDepartureRows.filter(
    (row) => row.departureTiming === "pre_snapshot"
  );
  const postSnapshotDepartureRows = knownDepartureRows.filter(
    (row) => row.departureTiming === "post_snapshot"
  );
  const unconfirmedDepartureRows = knownDepartureRows.filter(
    (row) => row.departureTiming === "unconfirmed"
  );

  const grossWealthTaxBeforeAdditionalDeparturesB = wealthTaxBaseRows.reduce(
    (sum, row) => sum + row.grossTaxB,
    0
  );
  const correctedBaseGrossWealthTaxB = correctedBaseRows.reduce(
    (sum, row) => sum + row.grossTaxB,
    0
  );
  const observedPreSnapshotDepartureGrossWealthTaxB =
    observedPreSnapshotDepartureRows.reduce((sum, row) => sum + row.grossTaxB, 0);
  const remainingResidentGrossWealthTaxB = remainingResidentRows.reduce(
    (sum, row) => sum + row.grossTaxB,
    0
  );
  const remainingResidentIncomeTaxB = remainingResidentRows.reduce(
    (sum, row) => sum + row.annualIncomeTaxB,
    0
  );
  const knownDepartureIncomeTaxB = knownDepartureRows.reduce(
    (sum, row) => sum + row.annualIncomeTaxB,
    0
  );

  // Unannounced departures are modeled as a proportional share of the
  // remaining resident base with no already-classified departure.
  const unannouncedWealthTaxLossB =
    remainingResidentGrossWealthTaxB * unannouncedDepartureShare;
  const unannouncedIncomeTaxB =
    remainingResidentIncomeTaxB * unannouncedDepartureShare;

  const grossWealthTaxB =
    grossWealthTaxBeforeAdditionalDeparturesB - unannouncedWealthTaxLossB;
  const totalMoverIncomeTaxB = knownDepartureIncomeTaxB + unannouncedIncomeTaxB;

  return {
    rows,
    rawForbesRows,
    correctedBaseRows,
    observedPreSnapshotDepartureRows,
    observedPostSnapshotDepartureRows,
    observedUnconfirmedDepartureRows,
    wealthTaxBaseRows,
    stayers: remainingResidentRows,
    movers: knownDepartureRows,
    knownDepartureRows,
    preSnapshotDepartureRows,
    postSnapshotDepartureRows,
    unconfirmedDepartureRows,
    grossWealthTaxB,
    correctedBaseGrossWealthTaxB,
    observedPreSnapshotDepartureGrossWealthTaxB,
    moverIncomeTaxB: totalMoverIncomeTaxB,
    knownDepartureIncomeTaxB,
    unannouncedWealthTaxLossB,
    unannouncedIncomeTaxB,
  };
}
