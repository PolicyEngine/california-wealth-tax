import { effectiveWealthTaxRate } from "./calculator";
import { estimateCaliforniaIncomeTaxB } from "./incomeTaxLookup";
import rauhData from "../data/billionaires_rauh.json";

export const VALUATION_DATE = new Date("2026-12-31");
export const WEALTH_TAX_THRESHOLD_B = 1;
export const MEDIAN_REAL_ESTATE_SHARE = 0.0064;
export const WEALTH_BASES = {
  ALL_FORBES: "allForbes",
  CORRECTED_BASE: "correctedBase",
  AFTER_PRE_SNAPSHOT_DEPARTURES: "afterPreSnapshotDepartures",
};

export const VALUATION_SOURCES = {
  // On the Forbes California list for the valuation date.
  CALIFORNIA_LIST: "californiaList",
  // On the January 1, 2026 roster; Forbes now lists them in another state or
  // country, so the current Forbes worth comes from the all-states list.
  ANY_STATE_LIST: "anyStateList",
  // On the roster; Forbes no longer lists them anywhere, so the value is the
  // last one Forbes published, dated by `lastListedDate`. Forbes drops people
  // for several reasons, death among them, so absence is not a valuation.
  LAST_LISTED: "lastListed",
  // On the roster, the all-states list for this date is available, and neither
  // it nor the stored history has a valuation. Left out of the base.
  OFF_FORBES_LIST: "offForbesList",
  // On the roster but missing from the valuation snapshot, with no all-states
  // list for this date to say why: carried at the January 1, 2026 value.
  FROZEN_ROSTER: "frozenRoster",
};

const NAME_ALIASES = {
  "Sergey Jr Brin": "Sergey Brin",
  "Archie Aldis Emmerson & family": "Archie Aldis Emmerson",
};
const FAMILY_SUFFIX = /\s*&\s*family\s*$/i;

// Join key shared with scripts/fetch_forbes.py: alias applied, trailing
// "& family" removed, case-folded. Forbes changes display names (adding or
// dropping "& family"), and an exact-string join silently drops those people.
export function normalizeName(name) {
  const canonical = NAME_ALIASES[name] ?? name ?? "";
  return canonical.trim().replace(FAMILY_SUFFIX, "").toLowerCase();
}

const KNOWN_REAL_ESTATE_BY_KEY = new Map(
  rauhData.map((row) => [normalizeName(row.name), row.realEstate ?? 0])
);

function yearsBetween(from, to) {
  return (to - from) / (365.25 * 24 * 60 * 60 * 1000);
}

function indexMetadataByKey(metadataByName = {}) {
  return new Map(
    Object.entries(metadataByName).map(([name, entry]) => [
      normalizeName(name),
      entry,
    ])
  );
}

function mergeBillionaireMetadata(row, metadataByKey) {
  const overrides = metadataByKey.get(normalizeName(row.name)) ?? {};

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
  const metadataByKey = indexMetadataByKey(metadata?.byName);
  const rows = billionaires.map((row) => mergeBillionaireMetadata(row, metadataByKey));
  const existingKeys = new Set(rows.map((row) => normalizeName(row.name)));
  const syntheticRows = (metadata?.syntheticRowsBySnapshot?.[snapshotDate] ?? [])
    .filter((row) => !existingKeys.has(normalizeName(row.name)))
    .map((row) => mergeBillionaireMetadata(row, metadataByKey));

  return [...rows, ...syntheticRows];
}

/**
 * Join the January 1, 2026 residency roster to a valuation snapshot.
 *
 * The measure fixes residency on January 1, 2026 and values net worth on
 * December 31, 2026, so the base is "who lived in California on January 1"
 * valued as late as the data allows. Valuation comes from, in order:
 *   1. the Forbes California list for the valuation date;
 *   2. the Forbes all-states list (`rosterValuations`), for roster members
 *      Forbes has since moved elsewhere; for one Forbes no longer lists at all,
 *      the last value Forbes published for them;
 *   3. without an all-states list for the date, the roster's own January 1
 *      value, flagged as frozen.
 * When the valuation date is after the roster date, people on the California
 * list for the valuation date who are not on the January 1 California list are
 * added and flagged `residencyAssumed`. The join knows list membership and
 * nothing else: it does not know why they were absent on January 1 (most of
 * them first appear with Forbes' annual list in March 2026, and the stored
 * January 1 list was clipped near $1.2 billion), so both their January 1
 * residency and their worth that day are inferred from the current listing.
 */
export function buildResidencyRosterValuationRows({
  residencyRows,
  valuationRows,
  rosterValuations = null,
  includeNewEntrants = false,
}) {
  const valuationByKey = new Map(
    valuationRows.map((row) => [normalizeName(row.name), row])
  );
  const anyStateByKey = new Map(
    Object.entries(rosterValuations?.rows ?? {}).map(([name, valuation]) => [
      normalizeName(name),
      valuation,
    ])
  );
  const rosterKeys = new Set(
    residencyRows.map((row) => normalizeName(row.name))
  );

  const rosterRows = residencyRows
    .filter((row) => row.includeInRawForbes !== false)
    .map((residencyRow) => {
      const key = normalizeName(residencyRow.name);
      const residencyFlags = {
        includeInRawForbes: residencyRow.includeInRawForbes,
        excludeFromCorrectedBase: residencyRow.excludeFromCorrectedBase,
        departureTiming: residencyRow.departureTiming,
        residencyAssumed: false,
      };
      const valuationRow = valuationByKey.get(key);

      if (valuationRow) {
        return {
          ...valuationRow,
          ...residencyFlags,
          // The fetcher keeps tracked departures in the file after Forbes
          // moves them out of California, flagged `includeInRawForbes: false`.
          valuationSource:
            valuationRow.includeInRawForbes === false
              ? VALUATION_SOURCES.ANY_STATE_LIST
              : VALUATION_SOURCES.CALIFORNIA_LIST,
          valuationFallback: false,
        };
      }

      const anyStateValuation = anyStateByKey.get(key);

      if (anyStateValuation) {
        return {
          ...residencyRow,
          ...anyStateValuation,
          ...residencyFlags,
          valuationSource: anyStateValuation.lastListedDate
            ? VALUATION_SOURCES.LAST_LISTED
            : VALUATION_SOURCES.ANY_STATE_LIST,
          valuationFallback: false,
        };
      }

      if (rosterValuations) {
        return {
          ...residencyRow,
          ...residencyFlags,
          rosterNetWorth: residencyRow.netWorth,
          netWorth: 0,
          valuationSource: VALUATION_SOURCES.OFF_FORBES_LIST,
          valuationFallback: false,
        };
      }

      return {
        ...residencyRow,
        ...residencyFlags,
        valuationSource: VALUATION_SOURCES.FROZEN_ROSTER,
        valuationFallback: true,
      };
    });

  if (!includeNewEntrants) {
    return rosterRows;
  }

  const newEntrantRows = valuationRows
    .filter(
      (row) =>
        row.includeInRawForbes !== false &&
        !rosterKeys.has(normalizeName(row.name))
    )
    .map((row) => ({
      ...row,
      residencyAssumed: true,
      valuationSource: VALUATION_SOURCES.CALIFORNIA_LIST,
      valuationFallback: false,
    }));

  return [...rosterRows, ...newEntrantRows];
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

  if (KNOWN_REAL_ESTATE_BY_KEY.has(normalizeName(row.name))) {
    return true;
  }

  return (row.realEstate ?? 0) > 0;
}

export function estimateRealEstateHoldingsB(row, growthFactor = 1) {
  const netWorthB = (row.netWorth / 1e9) * growthFactor;
  // Rows written before the name join was normalized carry a zero where the
  // Rauh file has a value under a different display name.
  const recordedRealEstate =
    row.realEstate || KNOWN_REAL_ESTATE_BY_KEY.get(normalizeName(row.name)) || 0;
  const observedRealEstateB = (recordedRealEstate / 1e9) * growthFactor;
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
  const excludedKeySet = new Set(excludedNames.map(normalizeName));
  const usingExplicitExclusions = excludedNames.length > 0 || !wealthBase;
  const years = yearsBetween(sourceDate, VALUATION_DATE);
  const growthFactor =
    wealthGrowthRate > -1 && wealthGrowthRate !== 0
      ? Math.pow(1 + wealthGrowthRate, years)
      : 1;

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
    const excludedFromWealthTaxBase = excludedKeySet.has(normalizeName(b.name));
    const offForbesList =
      b.valuationSource === VALUATION_SOURCES.OFF_FORBES_LIST;
    const inSelectedBase = usingExplicitExclusions
      ? flags.includeInRawForbes && !excludedFromWealthTaxBase
      : wealthBase === WEALTH_BASES.ALL_FORBES
        ? flags.includeInRawForbes
        : wealthBase === WEALTH_BASES.CORRECTED_BASE
          ? !flags.excludeFromCorrectedBase
          : !flags.excludeFromCorrectedBase && !flags.isPreSnapshotDeparture;
    // §50301 reaches net worth of $1 billion or more on the valuation date;
    // Forbes keeps some people on its list below that.
    const belowThreshold = rateBaseWealthB < WEALTH_TAX_THRESHOLD_B;
    const inBase = inSelectedBase && !offForbesList && !belowThreshold;
    const countsTowardKnownIncomeTaxLoss = usingExplicitExclusions
      ? flags.includeInRawForbes && flags.hasKnownDeparture
      : wealthBase === WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES &&
        !flags.excludeFromCorrectedBase &&
        flags.hasKnownDeparture;
    // The modeled response stands for people who left before January 1
    // without being documented. It can reach anyone still in the base except
    // those reported to have left after that date, who were residents on it.
    const eligibleForUnannouncedDeparture =
      inBase &&
      flags.departureTiming !== "post_snapshot" &&
      flags.departureTiming !== "unconfirmed";

    return {
      name: b.name,
      moved: flags.hasKnownDeparture,
      inBase,
      excludedFromWealthTaxBase,
      includeInRawForbes: flags.includeInRawForbes,
      excludeFromCorrectedBase: flags.excludeFromCorrectedBase,
      departureTiming: flags.departureTiming,
      valuationSource: b.valuationSource ?? VALUATION_SOURCES.CALIFORNIA_LIST,
      valuationFallback: Boolean(b.valuationFallback),
      residencyAssumed: Boolean(b.residencyAssumed),
      belowThreshold,
      lastListedDate: b.lastListedDate ?? null,
      forbesState: b.forbesState ?? null,
      forbesCity: b.forbesCity ?? null,
      forbesCountry: b.forbesCountry ?? null,
      rosterNetWorthB: (b.rosterNetWorth ?? 0) / 1e9,
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
  const sumNetWorthB = (selected) =>
    selected.reduce((sum, row) => sum + row.netWorthB, 0);
  const anyStateValuedRows = wealthTaxBaseRows.filter(
    (row) => row.valuationSource === VALUATION_SOURCES.ANY_STATE_LIST
  );
  const frozenRosterRows = wealthTaxBaseRows.filter(
    (row) => row.valuationSource === VALUATION_SOURCES.FROZEN_ROSTER
  );
  const lastListedRows = wealthTaxBaseRows.filter(
    (row) => row.valuationSource === VALUATION_SOURCES.LAST_LISTED
  );
  const belowThresholdRows = rows.filter(
    (row) => row.includeInRawForbes && row.belowThreshold
  );
  const assumedResidencyRows = wealthTaxBaseRows.filter(
    (row) => row.residencyAssumed
  );
  const offForbesListRows = rows.filter(
    (row) => row.valuationSource === VALUATION_SOURCES.OFF_FORBES_LIST
  );
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
  // Someone already counted as a known departure loses all of their income
  // tax there; the modeled share must not take a second cut of it.
  const remainingResidentIncomeTaxB = remainingResidentRows.reduce(
    (sum, row) =>
      row.countsTowardKnownIncomeTaxLoss ? sum : sum + row.annualIncomeTaxB,
    0
  );
  const knownDepartureIncomeTaxB = knownDepartureRows.reduce(
    (sum, row) => sum + row.annualIncomeTaxB,
    0
  );

  // Unannounced departures are modeled as a proportional share of the pool.
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
    baseNotes: {
      anyStateValuedCount: anyStateValuedRows.length,
      anyStateValuedWealthB: sumNetWorthB(anyStateValuedRows),
      frozenRosterCount: frozenRosterRows.length,
      frozenRosterWealthB: sumNetWorthB(frozenRosterRows),
      assumedResidencyCount: assumedResidencyRows.length,
      assumedResidencyWealthB: sumNetWorthB(assumedResidencyRows),
      lastListedCount: lastListedRows.length,
      lastListedWealthB: sumNetWorthB(lastListedRows),
      belowThresholdCount: belowThresholdRows.length,
      offForbesListCount: offForbesListRows.length,
      offForbesListRosterWealthB: offForbesListRows.reduce(
        (sum, row) => sum + row.rosterNetWorthB,
        0
      ),
    },
    stayers: remainingResidentRows,
    movers: knownDepartureRows,
    knownDepartureRows,
    preSnapshotDepartureRows,
    postSnapshotDepartureRows,
    unconfirmedDepartureRows,
    grossWealthTaxB,
    correctedBaseGrossWealthTaxB,
    observedPreSnapshotDepartureGrossWealthTaxB,
    unannouncedDeparturePoolGrossWealthTaxB: remainingResidentGrossWealthTaxB,
    unannouncedDeparturePoolShare:
      correctedBaseGrossWealthTaxB > 0
        ? remainingResidentGrossWealthTaxB / correctedBaseGrossWealthTaxB
        : 0,
    moverIncomeTaxB: totalMoverIncomeTaxB,
    knownDepartureIncomeTaxB,
    unannouncedWealthTaxLossB,
    unannouncedIncomeTaxB,
  };
}
