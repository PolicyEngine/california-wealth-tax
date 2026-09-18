/**
 * Assumption sets, without a snapshot date. One model; these are settings in it.
 */
import { WEALTH_TAX_PAYMENT_MODES } from "./calculator";
import { DEPARTURE_RESPONSE_MODES } from "./departureResponse";
import { INCOME_TAX_METHODS } from "./microModel";
import {
  normalizeResidencyExclusionIds,
  POST_SNAPSHOT_MOVER_IDS,
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
  horizonYears: Infinity,
  discountRate: 0.03,
};

// Galle, Gamage, Saez and Shanske: real estate left in, a 10% avoidance
// haircut, no migration response, no income-tax effects.
export const BERKELEY_ASSUMPTIONS = {
  ...BASELINE_ASSUMPTIONS,
  excludeRealEstate: false,
  avoidanceRate: 0.1,
};

// Rauh et al.: the residency claims in their paper treated as effective (their
// Tables 6 and 7), unannounced departures before January 1, and future
// income-tax losses in present value.
export const HOOVER_ASSUMPTIONS = {
  ...BASELINE_ASSUMPTIONS,
  residencyExclusionIds: normalizeResidencyExclusionIds([
    ...RESIDENCY_ONLY_EXCLUSION_IDS,
    ...RAUH_PRE_SNAPSHOT_EXCLUSION_IDS,
    ...POST_SNAPSHOT_MOVER_IDS,
  ]),
  includeIncomeTaxEffects: true,
  // Their f × C: the $4.55B midpoint divided among the cohort by wealth.
  incomeTaxMethod: INCOME_TAX_METHODS.WEALTH,
  cohortIncomeTaxB: 4.55,
  // Rauh et al. apply a semi-elasticity of 10.32 per point linearly to the
  // 5-point rate: 51.6% of the base leaves. This model's kernel is
  // 1 − exp(−ε × 0.05), which reaches 51.6% at ε = 14.5; the residual share
  // beyond the documented departures follows from that total.
  departureResponseMode: DEPARTURE_RESPONSE_MODES.ELASTICITY,
  migrationSemiElasticity: 14.5,
};

// What the two teams published, for display next to the model's own figures.
export const PUBLISHED_ESTIMATES = {
  berkeley: {
    label: "Published: about $100B",
    detail:
      "Galle, Gamage, Saez and Shanske, July 20, 2026: $104B on their own roster, rounded to $100B.",
  },
  hoover: {
    label: "Published: −$25B mean NPV",
    detail:
      "Rauh et al., March 2026: about $40B collected, mean net present value −$24.7B across 100,000 draws; −$42B in their central scenario at r − g = 3%.",
  },
};
