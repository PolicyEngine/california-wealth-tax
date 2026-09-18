/**
 * Assumption sets, without a snapshot date. One model; these are settings in it.
 */
import { WEALTH_TAX_PAYMENT_MODES } from "./calculator";
import { DEPARTURE_RESPONSE_MODES } from "./departureResponse";
import {
  normalizeResidencyExclusionIds,
  POST_SNAPSHOT_MOVER_IDS,
  RAUH_PRE_SNAPSHOT_EXCLUSION_IDS,
  RESIDENCY_ONLY_EXCLUSION_IDS,
} from "./residencyAdjustments";

// PolicyEngine baseline: the statutory base with no behavioral response.
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
  incomeYieldRate: 0.01,
};

// Rauh et al.: the residency claims in their paper treated as effective (their
// Tables 6 and 7), further migration before the valuation date, and future
// income-tax losses in present value.
export const HOOVER_ASSUMPTIONS = {
  ...BASELINE_ASSUMPTIONS,
  residencyExclusionIds: normalizeResidencyExclusionIds([
    ...RESIDENCY_ONLY_EXCLUSION_IDS,
    ...RAUH_PRE_SNAPSHOT_EXCLUSION_IDS,
    ...POST_SNAPSHOT_MOVER_IDS,
  ]),
  includeIncomeTaxEffects: true,
  // Rauh et al. apply a semi-elasticity of 10.32 per point linearly to the
  // 5-point rate: 51.6% of the base leaves. This model's kernel is
  // 1 − exp(−ε × 0.05), which reaches 51.6% at ε = 14.51; the residual share
  // beyond the documented departures follows from that total.
  departureResponseMode: DEPARTURE_RESPONSE_MODES.ELASTICITY,
  migrationSemiElasticity: 14.51,
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
      "Rauh et al., March 2026: about $40B collected, mean net present value −$24.7B across 100,000 draws; −$42B in the central case.",
  },
};
