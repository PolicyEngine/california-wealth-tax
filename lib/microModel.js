import { effectiveWealthTaxRate } from "./calculator";
import { estimateCaliforniaIncomeTaxB } from "./incomeTaxLookup";
import rauhData from "../data/billionaires_rauh.json";
import incomeTaxFilings from "../data/income_tax_filings.json";
import wealthTaxHouseholds from "../data/wealth_tax_households.json";

export const VALUATION_DATE = new Date("2026-12-31");
export const WEALTH_TAX_THRESHOLD_B = 1;
export const MEDIAN_REAL_ESTATE_SHARE = 0.0064;
export const WEALTH_BASES = {
  ALL_FORBES: "allForbes",
  CORRECTED_BASE: "correctedBase",
  AFTER_PRE_SNAPSHOT_DEPARTURES: "afterPreSnapshotDepartures",
};

// How the cohort's California income tax is divided among its members.
export const INCOME_TAX_METHODS = {
  // People with filings-based estimates get those; the rest of the cohort
  // total is divided among everyone else by wealth.
  FILINGS: "filings",
  // The cohort total is divided among everyone by wealth, so a mover's income
  // tax is their wealth share of the total (Rauh et al.'s f × C).
  WEALTH: "wealth",
  // No cohort total: each person's income is a uniform yield on wealth, taxed
  // at PolicyEngine's California rates.
  YIELD: "yield",
};

function averageFilingsIncomeTaxB(byYear, years) {
  const values = years.map((year) => byYear[String(year)] ?? 0);

  return values.reduce((sum, value) => sum + value, 0) / values.length / 1000;
}

export const VALUATION_SOURCES = {
  // On the Forbes California list for the valuation date.
  CALIFORNIA_LIST: "californiaList",
  // On the January 1, 2026 roster; Forbes now lists them in another state or
  // country, so the current Forbes worth comes from the all-states list.
  ANY_STATE_LIST: "anyStateList",
  // On the roster; Forbes no longer lists them anywhere, so the value is the
  // last positive one in the stored daily history, dated by `lastListedDate`
  // (Forbes' feed sometimes ends a person's run with a zero or negative entry).
  // Forbes drops people for several reasons, death among them, so absence is
  // not a valuation.
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

const SPOUSE_UNIT_BY_KEY = new Map(wealthTaxHouseholds.couples.flatMap(
  (couple) => couple.members.map((name) => [normalizeName(name), couple.id])
));

// Filings-based California income tax, $ billions a year, by join key.
export const FILINGS_INCOME_TAX_B_BY_KEY = new Map(
  Object.entries(incomeTaxFilings.people).map(([name, byYear]) => [
    normalizeName(name),
    averageFilingsIncomeTaxB(byYear, incomeTaxFilings.averageYears),
  ])
);

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
 *      the last positive value in the stored daily history;
 *   3. without an all-states list for the date, the roster's own January 1
 *      value, flagged as frozen.
 * When the valuation date is after the roster date, people on the California
 * list for the valuation date who are not on the January 1 California list are
 * added and flagged `residencyAssumed`. The join knows list membership and
 * nothing else: it does not know why they were absent on January 1. The
 * stored January 1 list is a backfill of US-citizen Forbes profiles whose
 * profile placed them in California when the backfill ran (March 2026), so it
 * lacks every non-US citizen, anyone Forbes had not yet added to its
 * real-time list, and anyone whose profile then placed them elsewhere. Both
 * their January 1 residency and their worth that day are inferred from the
 * current listing.
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
  postSnapshotMoverNames = [],
  neverResidentNames = [],
  excludeRealEstate,
  incomeYieldRate,
  incomeTaxMethod = INCOME_TAX_METHODS.YIELD,
  cohortIncomeTaxB = 0,
  wealthGrowthRate = 0,
  unannouncedDepartureShare = 0,
  sourceDate = new Date("2025-10-17"),
}) {
  const excludedKeySet = new Set(excludedNames.map(normalizeName));
  const postSnapshotMoverKeySet = new Set(postSnapshotMoverNames.map(normalizeName));
  const neverResidentKeySet = new Set(neverResidentNames.map(normalizeName));
  const usingExplicitExclusions = excludedNames.length > 0 || !wealthBase;
  const years = yearsBetween(sourceDate, VALUATION_DATE);
  const growthFactor =
    wealthGrowthRate > -1 && wealthGrowthRate !== 0
      ? Math.pow(1 + wealthGrowthRate, years)
      : 1;

  let rows = billionaires.map((b) => {
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
    // Income-tax loss follows individual residency choices, even when a
    // resident spouse keeps this person's assets in the wealth-tax base.
    // Rauh et al. classify Houston and Snyder as having left California before
    // the measure existed. If that claim is applied, their income tax was
    // already gone, so removing them creates no loss attributable to it.
    const countsTowardKnownIncomeTaxLoss = usingExplicitExclusions
      ? flags.includeInRawForbes &&
        ((excludedFromWealthTaxBase &&
          !neverResidentKeySet.has(normalizeName(b.name))) ||
          postSnapshotMoverKeySet.has(normalizeName(b.name)))
      : wealthBase === WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES &&
        !flags.excludeFromCorrectedBase &&
        flags.hasKnownDeparture;
    // The modeled response stands for people who left before January 1
    // without being documented. It can reach anyone still in the base except
    // those the user has marked as leaving after that date, who were
    // residents on it.
    const eligibleForUnannouncedDeparture =
      inBase && !postSnapshotMoverKeySet.has(normalizeName(b.name));

    return {
      name: b.name,
      taxUnitId: SPOUSE_UNIT_BY_KEY.get(normalizeName(b.name)) ?? normalizeName(b.name),
      inSelectedBase,
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
      // Forbes' own number, before growth to the valuation date.
      rawNetWorthB,
      citizenship: b.citizenship ?? null,
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

  // RTC §50301(a) treats spouses as one individual; §50308(f) includes the
  // spouse's worldwide wealth wherever resident. These are separately valued
  // Forbes shares, so each asset enters once. If either spouse remains a
  // resident, both observed shares remain taxable. Income tax stays per person.
  const taxUnits = new Map();
  for (const row of rows) {
    if (!taxUnits.has(row.taxUnitId)) taxUnits.set(row.taxUnitId, []);
    taxUnits.get(row.taxUnitId).push(row);
  }
  for (const members of taxUnits.values()) {
    const unitTaxableWealthB = members.reduce((sum, row) => sum + row.taxableWealthB, 0);
    const unitRate = effectiveWealthTaxRate(unitTaxableWealthB);
    const unitBelowThreshold = unitTaxableWealthB < WEALTH_TAX_THRESHOLD_B;
    const unitSelected = members.some((row) => row.inSelectedBase);
    const unitHasPostSnapshotMover = members.some((row) => postSnapshotMoverKeySet.has(normalizeName(row.name)));
    for (const row of members) {
      row.taxUnitMembers = members.map((member) => member.name);
      row.taxUnitTaxableWealthB = unitTaxableWealthB;
      row.taxUnitHasPostSnapshotMover = unitHasPostSnapshotMover;
      row.rate = unitRate;
      row.grossTaxB = row.taxableWealthB * unitRate;
      row.belowThreshold = unitBelowThreshold;
      row.inBase = unitSelected && !unitBelowThreshold && row.valuationSource !== VALUATION_SOURCES.OFF_FORBES_LIST;
      row.eligibleForUnannouncedDeparture = row.inBase && !unitHasPostSnapshotMover;
    }
  }

  if (incomeTaxMethod !== INCOME_TAX_METHODS.YIELD) {
    // The cohort is everyone on the roster with a Forbes valuation, movers
    // included: a mover's income tax is part of what the cohort paid.
    // The cohort that pays the total: everyone Forbes lists at $1 billion or
    // more on its own number (the real-estate toggle does not move it), less
    // anyone removed as a prior departure, who is not a California taxpayer.
    const inCohort = (row) =>
      row.includeInRawForbes &&
      row.rawNetWorthB >= WEALTH_TAX_THRESHOLD_B &&
      !(row.excludedFromWealthTaxBase && neverResidentKeySet.has(normalizeName(row.name)));
    const filedTaxB = (row) =>
      incomeTaxMethod === INCOME_TAX_METHODS.FILINGS
        ? FILINGS_INCOME_TAX_B_BY_KEY.get(normalizeName(row.name))
        : undefined;
    const cohortRows = rows.filter(inCohort);
    const filedTotalB = cohortRows.reduce(
      (sum, row) => sum + (filedTaxB(row) ?? 0),
      0
    );
    const unfiledWealthB = cohortRows.reduce(
      (sum, row) => (filedTaxB(row) === undefined ? sum + row.netWorthB : sum),
      0
    );
    const unfiledTotalB = Math.max(0, cohortIncomeTaxB - filedTotalB);

    rows = rows.map((row) => {
      if (!inCohort(row)) {
        return {
          ...row,
          annualIncomeB: 0,
          annualIncomeTaxB: 0,
          incomeTaxSource: null,
          inIncomeTaxCohort: false,
        };
      }

      const filed = filedTaxB(row);

      return {
        ...row,
        annualIncomeB: null,
        annualIncomeTaxB:
          filed !== undefined
            ? filed
            : unfiledWealthB > 0
              ? (unfiledTotalB * row.netWorthB) / unfiledWealthB
              : 0,
        incomeTaxSource: filed !== undefined ? "filings" : "wealthShare",
        inIncomeTaxCohort: true,
      };
    });
  }

  const rawForbesRows = rows.filter((row) => row.includeInRawForbes);
  // Aggregate counterfactual bases by entire wealth-tax unit too. Removing
  // only one spouse is not a wealth-tax loss while the other remains resident.
  const rowsInUnits = (predicate) => {
    const selectedUnits = new Set(rows.filter(predicate).map((row) => row.taxUnitId));
    return rows.filter((row) => selectedUnits.has(row.taxUnitId));
  };
  const correctedBaseRows =
    usingExplicitExclusions
      ? rowsInUnits(
          (row) =>
            row.includeInRawForbes && (!row.excludedFromWealthTaxBase || row.departureTiming === "pre_snapshot")
        )
      : rowsInUnits((row) => !row.excludeFromCorrectedBase);
  const unitFullyExcluded = (row) => taxUnits.get(row.taxUnitId).every(
    (member) => !member.inSelectedBase
  );
  const observedPreSnapshotDepartureRows =
    usingExplicitExclusions
      ? rowsInUnits(
          (row) =>
            row.includeInRawForbes && unitFullyExcluded(row) &&
            row.excludedFromWealthTaxBase &&
            row.departureTiming === "pre_snapshot"
        )
      : rowsInUnits((row) => !row.excludeFromCorrectedBase &&
          row.departureTiming === "pre_snapshot" &&
          taxUnits.get(row.taxUnitId).every((member) => member.departureTiming === "pre_snapshot"));
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
  // Under $1 billion on Forbes' own number, before any real-estate exclusion.
  const belowThresholdOnForbesValueRows = belowThresholdRows.filter(
    (row) => row.netWorthB < WEALTH_TAX_THRESHOLD_B
  );
  const assumedResidencyRows = wealthTaxBaseRows.filter(
    (row) => row.residencyAssumed
  );
  // The January 1 list is a backfill of US-citizen profiles, so non-US
  // citizens Forbes places in California enter only through the current list.
  const assumedResidencyNonCitizenRows = assumedResidencyRows.filter(
    (row) => row.citizenship && row.citizenship !== "United States"
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
  // The income-tax side of the modeled response reaches everyone in the
  // income-tax cohort the wealth-tax side would reach if they were in the
  // base (a cohort member under the threshold after the real-estate exclusion
  // pays income tax and can leave like anyone else). Someone already counted
  // as a known departure loses all of their income tax there; the modeled
  // share must not take a second cut of it.
  const unannouncedIncomeTaxPoolRows = rows.filter(
    (row) =>
      (row.inIncomeTaxCohort ?? row.inBase) &&
      row.includeInRawForbes &&
      !row.excludedFromWealthTaxBase &&
      !postSnapshotMoverKeySet.has(normalizeName(row.name)) &&
      !row.countsTowardKnownIncomeTaxLoss
  );
  const remainingResidentIncomeTaxB = unannouncedIncomeTaxPoolRows.reduce(
    (sum, row) => sum + row.annualIncomeTaxB,
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
      assumedResidencyNonCitizenCount: assumedResidencyNonCitizenRows.length,
      assumedResidencyNonCitizenWealthB: sumNetWorthB(assumedResidencyNonCitizenRows),
      lastListedCount: lastListedRows.length,
      lastListedWealthB: sumNetWorthB(lastListedRows),
      belowThresholdCount: belowThresholdRows.length,
      belowThresholdOnForbesValueCount: belowThresholdOnForbesValueRows.length,
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
    grossWealthTaxBeforeAdditionalDeparturesB,
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
