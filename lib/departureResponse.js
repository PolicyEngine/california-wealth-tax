export const DEPARTURE_RESPONSE_MODES = {
  SHARE: "share",
  ELASTICITY: "elasticity",
};

export const DEFAULT_WEALTH_TAX_RATE_DELTA = 0.05;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function totalLossShareFromElasticity(
  totalElasticity,
  taxRateDelta = DEFAULT_WEALTH_TAX_RATE_DELTA
) {
  if (taxRateDelta <= 0 || totalElasticity <= 0) {
    return 0;
  }

  return clamp01(1 - Math.exp(-totalElasticity * taxRateDelta));
}

/**
 * Share of the pool that must leave for total departures to reach the
 * elasticity's target.
 *
 * All three shares are of the same base: the base before documented
 * pre-January-1 departures. `observedLossShare` is what the documented
 * departures remove. `poolShare` is what the people the modeled response can
 * still reach account for; it defaults to everyone left, and is smaller when
 * some of them are known to have been residents on January 1. The residual is
 * solved against the pool it is applied to, so observed plus modeled departures
 * equal the target whenever the pool is large enough to supply it.
 */
export function residualDepartureShareFromElasticity({
  totalElasticity,
  observedLossShare,
  poolShare,
  taxRateDelta = DEFAULT_WEALTH_TAX_RATE_DELTA,
}) {
  const boundedObservedLossShare = clamp01(observedLossShare);
  const boundedPoolShare = clamp01(poolShare ?? 1 - boundedObservedLossShare);
  const totalLossShare = totalLossShareFromElasticity(
    totalElasticity,
    taxRateDelta
  );

  if (boundedPoolShare <= 0 || totalLossShare <= boundedObservedLossShare) {
    return 0;
  }

  return clamp01((totalLossShare - boundedObservedLossShare) / boundedPoolShare);
}

export function impliedRemainerElasticity({
  totalElasticity,
  observedLossShare,
  poolShare,
  taxRateDelta = DEFAULT_WEALTH_TAX_RATE_DELTA,
}) {
  const residualShare = residualDepartureShareFromElasticity({
    totalElasticity,
    observedLossShare,
    poolShare,
    taxRateDelta,
  });

  if (taxRateDelta <= 0 || residualShare <= 0) {
    return 0;
  }

  if (residualShare >= 1) {
    return Infinity;
  }

  return -Math.log(1 - residualShare) / taxRateDelta;
}

export function effectiveAdditionalDepartureShare({
  mode,
  share,
  totalElasticity,
  observedLossShare,
  poolShare,
  taxRateDelta = DEFAULT_WEALTH_TAX_RATE_DELTA,
}) {
  if (mode === DEPARTURE_RESPONSE_MODES.ELASTICITY) {
    return residualDepartureShareFromElasticity({
      totalElasticity,
      observedLossShare,
      poolShare,
      taxRateDelta,
    });
  }

  return clamp01(share);
}
