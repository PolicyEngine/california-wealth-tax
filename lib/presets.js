/**
 * Assumption sets, without a snapshot date. One model; these are settings in it.
 */
import { WEALTH_TAX_PAYMENT_MODES } from "./calculator";
import { DEPARTURE_RESPONSE_MODES } from "./departureResponse";
import {
  normalizeResidencyExclusionIds,
  PRE_SNAPSHOT_EXCLUSION_IDS,
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

// Rauh et al.: every documented residency claim treated as effective, further
// migration before the valuation date, and future income-tax losses in
// present value.
export const HOOVER_ASSUMPTIONS = {
  ...BASELINE_ASSUMPTIONS,
  residencyExclusionIds: normalizeResidencyExclusionIds([
    ...RESIDENCY_ONLY_EXCLUSION_IDS,
    ...PRE_SNAPSHOT_EXCLUSION_IDS,
  ]),
  includeIncomeTaxEffects: true,
  unannouncedDepartureShare: 0.48,
};
