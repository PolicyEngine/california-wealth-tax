/**
 * Score one scenario: parameters in, person-level results and fiscal impact out.
 * The page, the assumption bridge, and the paper all call this one function.
 */
import { calculateFiscalImpact } from "./calculator";
import { effectiveAdditionalDepartureShare } from "./departureResponse";
import { computeMicroResults } from "./microModel";
import { residencyExcludedNamesFromIds } from "./residencyAdjustments";

// CBO CPI-U forecast via PolicyEngine: about 2.45% annualized 2026-2030.
// Converts nominal wealth growth to real growth for discounting.
export const INFLATION_RATE = 0.025;

export function toRealGrowthRate(nominalGrowthRate, inflationRate = INFLATION_RATE) {
  return (1 + nominalGrowthRate) / (1 + inflationRate) - 1;
}

export function scoreScenario({ params, rows, incomeTaxLookup, sourceDate }) {
  const excludedNames = residencyExcludedNamesFromIds(
    params.residencyExclusionIds
  );
  const microInputs = {
    billionaires: rows,
    incomeTaxLookup,
    excludedNames,
    excludeRealEstate: params.excludeRealEstate,
    incomeYieldRate: params.incomeYieldRate,
    wealthGrowthRate: params.wealthGrowthRate,
    sourceDate,
  };
  const baseMicro = computeMicroResults({
    ...microInputs,
    unannouncedDepartureShare: 0,
  });
  const observedDepartureLossShare =
    baseMicro.correctedBaseGrossWealthTaxB > 0
      ? baseMicro.observedPreSnapshotDepartureGrossWealthTaxB /
        baseMicro.correctedBaseGrossWealthTaxB
      : 0;
  const modeledAdditionalDepartureShare = effectiveAdditionalDepartureShare({
    mode: params.departureResponseMode,
    share: params.unannouncedDepartureShare,
    totalElasticity: params.migrationSemiElasticity,
    observedLossShare: observedDepartureLossShare,
    poolShare: baseMicro.unannouncedDeparturePoolShare,
  });
  const micro = computeMicroResults({
    ...microInputs,
    unannouncedDepartureShare: modeledAdditionalDepartureShare,
  });
  const result = calculateFiscalImpact({
    grossWealthTaxB: micro.grossWealthTaxB,
    avoidanceRate: params.avoidanceRate,
    moverIncomeTaxB: micro.moverIncomeTaxB,
    includeIncomeTaxEffects: params.includeIncomeTaxEffects,
    incomeTaxAttributionRate: params.incomeTaxAttributionRate,
    horizonYears: params.horizonYears,
    discountRate: params.discountRate,
    annualReturnRate: params.annualReturnRate,
    growthRate: toRealGrowthRate(params.wealthGrowthRate),
    wealthTaxPaymentMode: params.wealthTaxPaymentMode,
  });

  return { baseMicro, micro, result, modeledAdditionalDepartureShare };
}
