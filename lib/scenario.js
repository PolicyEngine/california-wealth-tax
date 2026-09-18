/**
 * Score one scenario: parameters in, person-level results and fiscal impact out.
 * The page, the assumption bridge, and the paper all call this one function.
 */
import { calculateFiscalImpact } from "./calculator";
import { effectiveAdditionalDepartureShare } from "./departureResponse";
import { computeMicroResults } from "./microModel";
import {
  postSnapshotMoverNamesFromIds,
  residencyExcludedNamesFromIds,
} from "./residencyAdjustments";

export function scoreScenario({ params, rows, incomeTaxLookup, sourceDate }) {
  const excludedNames = residencyExcludedNamesFromIds(
    params.residencyExclusionIds
  );
  const postSnapshotMoverNames = postSnapshotMoverNamesFromIds(
    params.residencyExclusionIds
  );
  const microInputs = {
    billionaires: rows,
    incomeTaxLookup,
    excludedNames,
    postSnapshotMoverNames,
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
    // Real growth of the income-tax stream, set directly; wealth growth to the
    // valuation date is a separate, nominal input.
    growthRate: params.incomeGrowthRate ?? 0,
    wealthTaxPaymentMode: params.wealthTaxPaymentMode,
  });

  return { baseMicro, micro, result, modeledAdditionalDepartureShare };
}
