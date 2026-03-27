import { effectiveWealthTaxRate } from "./calculator";
import { estimateCaliforniaIncomeTaxB } from "./incomeTaxLookup";

export const VALUATION_DATE = new Date("2026-12-31");
export const WEALTH_BASES = {
  ALL_FORBES: "allForbes",
  CORRECTED_BASE: "correctedBase",
  AFTER_PRE_SNAPSHOT_DEPARTURES: "afterPreSnapshotDepartures",
};

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

/**
 * Compute per-billionaire and aggregate values from microdata.
 */
export function computeMicroResults({
  billionaires,
  incomeTaxLookup,
  wealthBase,
  excludeRealEstate,
  incomeYieldRate,
  wealthGrowthRate = 0,
  unannouncedDepartureShare = 0,
  sourceDate = new Date("2025-10-17"),
}) {
  const includeMovers = wealthBase !== "afterDepartures";
  const years = yearsBetween(sourceDate, VALUATION_DATE);
  const growthFactor =
    wealthGrowthRate > 0 ? Math.pow(1 + wealthGrowthRate, years) : 1;

  const rows = billionaires.map((b) => {
    const flags = getBillionaireFlags(b);
    const rawNetWorthB = b.netWorth / 1e9;
    const netWorthB = rawNetWorthB * growthFactor;
    const reB = (excludeRealEstate ? b.realEstate : 0) / 1e9 * growthFactor;
    const taxableWealthB = Math.max(0, netWorthB - reB);
    const rateBaseWealthB = excludeRealEstate ? taxableWealthB : netWorthB;
    const rate = effectiveWealthTaxRate(rateBaseWealthB);
    const grossTaxB = taxableWealthB * rate;
    const annualIncomeB = taxableWealthB * incomeYieldRate;
    const annualIncomeTaxB = estimateCaliforniaIncomeTaxB(
      annualIncomeB,
      incomeTaxLookup
    );
    const inBase =
      wealthBase === WEALTH_BASES.ALL_FORBES
        ? flags.includeInRawForbes
        : wealthBase === WEALTH_BASES.CORRECTED_BASE
          ? !flags.excludeFromCorrectedBase
          : !flags.excludeFromCorrectedBase && !flags.isPreSnapshotDeparture;
    const countsTowardKnownIncomeTaxLoss =
      wealthBase === WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES &&
      !flags.excludeFromCorrectedBase &&
      flags.hasKnownDeparture;
    const eligibleForUnannouncedDeparture =
      inBase && !flags.excludeFromCorrectedBase && !flags.hasKnownDeparture;

    return {
      name: b.name,
      moved: flags.hasKnownDeparture,
      inBase,
      includeInRawForbes: flags.includeInRawForbes,
      excludeFromCorrectedBase: flags.excludeFromCorrectedBase,
      departureTiming: flags.departureTiming,
      countsTowardKnownIncomeTaxLoss,
      eligibleForUnannouncedDeparture,
      netWorthB,
      realEstateB: reB,
      taxableWealthB,
      rate,
      grossTaxB,
      annualIncomeB,
      annualIncomeTaxB,
    };
  });

  const rawForbesRows = rows.filter((row) => row.includeInRawForbes);
  const correctedBaseRows = rows.filter((row) => !row.excludeFromCorrectedBase);
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

  // Unannounced departures: share of stayer wealth that also left
  // Reduces wealth tax proportionally, adds to income tax loss proportionally
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
    wealthTaxBaseRows,
    stayers: remainingResidentRows,
    movers: knownDepartureRows,
    knownDepartureRows,
    preSnapshotDepartureRows,
    postSnapshotDepartureRows,
    unconfirmedDepartureRows,
    grossWealthTaxB,
    moverIncomeTaxB: totalMoverIncomeTaxB,
    knownDepartureIncomeTaxB,
    unannouncedWealthTaxLossB,
    unannouncedIncomeTaxB,
  };
}
