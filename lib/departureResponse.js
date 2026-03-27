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

export function residualDepartureShareFromElasticity({
  totalElasticity,
  observedLossShare,
  taxRateDelta = DEFAULT_WEALTH_TAX_RATE_DELTA,
}) {
  const boundedObservedLossShare = clamp01(observedLossShare);
  const totalLossShare = totalLossShareFromElasticity(
    totalElasticity,
    taxRateDelta
  );

  if (boundedObservedLossShare >= 1 || totalLossShare <= boundedObservedLossShare) {
    return 0;
  }

  return clamp01(
    (totalLossShare - boundedObservedLossShare) / (1 - boundedObservedLossShare)
  );
}

export function impliedRemainerElasticity({
  totalElasticity,
  observedLossShare,
  taxRateDelta = DEFAULT_WEALTH_TAX_RATE_DELTA,
}) {
  const residualShare = residualDepartureShareFromElasticity({
    totalElasticity,
    observedLossShare,
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
  taxRateDelta = DEFAULT_WEALTH_TAX_RATE_DELTA,
}) {
  if (mode === DEPARTURE_RESPONSE_MODES.ELASTICITY) {
    return residualDepartureShareFromElasticity({
      totalElasticity,
      observedLossShare,
      taxRateDelta,
    });
  }

  return clamp01(share);
}
