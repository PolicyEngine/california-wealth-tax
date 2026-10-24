/**
 * Assumption sets, without a snapshot date. One model; these are settings in it.
 */
import { WEALTH_TAX_PAYMENT_MODES } from "./calculator";
import { DEPARTURE_RESPONSE_MODES } from "./departureResponse";
import { INCOME_TAX_METHODS } from "./microModel";
import {
  normalizeResidencyExclusionIds,
  POST_SNAPSHOT_MOVER_IDS,
  PRE_SNAPSHOT_EXCLUSION_IDS,
  RAUH_MARCH_RESIDENCY_ONLY_IDS,
  RAUH_PRE_SNAPSHOT_EXCLUSION_IDS,
  RESIDENCY_ONLY_EXCLUSION_IDS,
} from "./residencyAdjustments";

// The statutory score: everyone on the roster, valued today, at the statutory
// rate, with no behavioral response. It is the calculator's default state and
// a fact about the measure and the roster, not a forecast; every published
// estimate is a set of departures from it.
export const BASELINE_ASSUMPTIONS = {
  residencyExclusionIds: [],
  departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
  wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
  excludeRealEstate: true,
  includeIncomeTaxEffects: false,
  avoidanceRate: 0,
  unannouncedDepartureShare: 0,
  migrationSemiElasticity: 12.6,
  wealthGrowthRate: 0,
  // Real growth of the movers' income-tax stream. Rauh et al. report results
  // for r − g of 1.5%, 3%, and 4.5%; with a 3% real discount rate, 0 here is
  // their central case.
  incomeGrowthRate: 0,
  annualReturnRate: 0,
  // The cohort's California income tax: $4.3B is Boll, Saez and Zucman's 2025
  // estimate and sits inside Rauh et al.'s $3.3B-$5.8B range. The two teams
  // agree on the total and disagree on who pays it. The baseline gives the four
  // largest fortunes their filings-based amounts and divides the rest by wealth.
  incomeTaxMethod: INCOME_TAX_METHODS.FILINGS,
  cohortIncomeTaxB: 4.3,
  incomeYieldRate: 0.02,
  incomeTaxAttributionRate: 1,
  // A total share of the cohort's income tax lost to departures. Documented
  // and modeled departures count toward it; anything above them is people who
  // leave after January 1, who still owe the wealth tax. Zero adds nothing.
  incomeTaxDepartureShare: 0,
  horizonYears: Infinity,
  discountRate: 0.03,
  // Explicit constant-price assumption, not an inflation forecast. Nominal
  // receipts are deflated by this rate before the real discount is applied.
  inflationRate: 0,
  // Legal assumptions: the measure survives challenge, people who left after
  // January 1 still owe it, and non-US citizens Forbes places in California
  // are taxed like anyone else. Each is the measure as written.
  litigationSurvivalRate: 1,
  collectFromPostSnapshotMovers: true,
  includeNonCitizens: true,
};

// Galle, Gamage, Saez and Shanske: real estate left in, a 10% avoidance
// haircut, no migration response, no income-tax effects.
export const BERKELEY_ASSUMPTIONS = {
  ...BASELINE_ASSUMPTIONS,
  excludeRealEstate: false,
  avoidanceRate: 0.1,
};

// Rauh et al., March 2026 (Hoover Institution working paper): their two
// contested residency classifications and their departures before January 1
// (Table 6) out of the base, the four later or unconfirmed departures in their
// Table 7 marked as leaving after January 1, unannounced departures before
// January 1, and future income-tax losses in present value. The Hoover
// assumptions followed this version until October 21, 2026; it stays here for
// comparison.
//
// One difference from their formula. They tie the share of the cohort's
// income tax lost to the share of wealth-tax revenue lost (f = 1 − WT/94.20),
// and their preferred estimate keeps Mark Zuckerberg in the base. Here the
// four Table 7 movers owe the wealth tax, as the measure is written, and their
// income tax counts as lost on top of the modeled share, so f exceeds the
// wealth-tax loss.
export const HOOVER_MARCH_2026_ASSUMPTIONS = {
  ...BASELINE_ASSUMPTIONS,
  residencyExclusionIds: normalizeResidencyExclusionIds([
    ...RAUH_MARCH_RESIDENCY_ONLY_IDS,
    ...RAUH_PRE_SNAPSHOT_EXCLUSION_IDS,
    ...POST_SNAPSHOT_MOVER_IDS,
  ]),
  includeIncomeTaxEffects: true,
  // Their C, the $4.55B midpoint, divided among the cohort by wealth: a
  // mover's income tax is their wealth share of it.
  incomeTaxMethod: INCOME_TAX_METHODS.WEALTH,
  cohortIncomeTaxB: 4.55,
  // Rauh et al. apply a semi-elasticity of 10.32 per point linearly to the
  // 5-point rate: 51.6% of the base leaves. This model's kernel is
  // 1 − exp(−ε × 0.05), which reaches 51.6% at ε = 14.5; the residual share
  // beyond the documented departures follows from that total.
  departureResponseMode: DEPARTURE_RESPONSE_MODES.ELASTICITY,
  migrationSemiElasticity: 14.5,
};

// Jaros and Rauh, NBER Working Paper 35899 (October 2026; also their Tax Policy
// and the Economy chapter), the version the Hoover assumptions follow since
// October 21, 2026. This is their central revenue estimate (Section 4.4): the
// recognized base removes the documented departures before January 1 (now
// including Travis Kalanick), three people who left before the October 2025
// filing, Mark Zuckerberg (who announced his departure in February 2026;
// collecting from someone who left after January 1 depends on that date
// surviving challenge), and non-US citizens (their Section 3.5; their files
// also put six people Forbes lists as US citizens in that group, who stay in
// here). Wealth grows 7% a year to the valuation date from this calculator's
// data date (they grow January 1 values 7%). No unannounced departures reduce
// the wealth-tax base. A 50% litigation-survival probability (their q) scales
// receipts. Their f, the share of the cohort's income tax lost to departures
// including undocumented ones, is the midpoint 0.45 of their 30%-60% range,
// with C = $4.55B divided by wealth across this calculator's cohort and
// r − g = 3%.
//
// Their NPV section is built differently: it centers wealth-tax revenue on
// $36B, half of the $72B ceiling after the confirmed departures (Zuckerberg
// and the pre-filing exits in), giving a point NPV of −$32.25B at f = 0.45,
// C = $4.55B and r − g = 3% by their formula, and reports a mean of −$38.9B
// over draws of revenue ($0 to $72B), f (30% to 60%), C ($3.3B to $5.8B) and
// r − g (1.5% to 4.5%). Setting
// collectFromPostSnapshotMovers to true here reproduces that revenue
// definition for Zuckerberg.
//
// The working paper scores this set. To move the Hoover starting point again,
// define a new set, point HOOVER_ASSUMPTIONS at it, update the identity check
// in lib/hooverVersions.test.js, and move the paper to the new set.
export const HOOVER_NBER_OCTOBER_2026_ASSUMPTIONS = {
  ...BASELINE_ASSUMPTIONS,
  residencyExclusionIds: normalizeResidencyExclusionIds([
    ...RESIDENCY_ONLY_EXCLUSION_IDS,
    ...PRE_SNAPSHOT_EXCLUSION_IDS,
    "zuckerberg",
  ]),
  includeIncomeTaxEffects: true,
  incomeTaxMethod: INCOME_TAX_METHODS.WEALTH,
  cohortIncomeTaxB: 4.55,
  incomeTaxDepartureShare: 0.45,
  wealthGrowthRate: 0.07,
  litigationSurvivalRate: 0.5,
  collectFromPostSnapshotMovers: false,
  includeNonCitizens: false,
};

// The calculator's Hoover starting point.
export const HOOVER_ASSUMPTIONS = HOOVER_NBER_OCTOBER_2026_ASSUMPTIONS;

// What the two teams published, for display next to the model's own figures.
export const PUBLISHED_ESTIMATES = {
  berkeley: {
    label: "Published: about $100B",
    detail:
      "Galle, Gamage, Saez and Shanske, July 20, 2026: $104B on their own roster, rounded to $100B.",
  },
  hoover: {
    label: "Published: −$39B mean NPV",
    detail:
      "Jaros and Rauh, NBER Working Paper 35899, October 2026: about $30B collected (range $28B to $36B) after a 50% litigation-survival discount; mean net present value −$38.9B across 100,000 draws, 85% of them negative, with revenue drawn from $0 to the $72B ceiling (Zuckerberg and the pre-filing exits in). Rauh et al.'s March 2026 version: about $40B collected, mean −$24.7B.",
  },
};
