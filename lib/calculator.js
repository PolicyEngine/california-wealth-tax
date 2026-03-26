/**
 * Pure fiscal impact calculator — no API calls, just math.
 * All PE-dependent data is precomputed and loaded as static JSON.
 */

/**
 * Effective wealth tax rate with phase-in from $1B to $1.1B.
 * @param {number} netWorthB - Net worth in billions
 * @returns {number} Effective rate (0 to 0.05)
 */
export function effectiveWealthTaxRate(netWorthB) {
  if (netWorthB >= 1.1) return 0.05;
  if (netWorthB <= 1.0) return 0;
  return ((netWorthB - 1.0) / 0.1) * 0.05;
}

function presentValueWithReturnHazard(
  annualAmount,
  discountRate,
  annualReturnRate,
  years,
  growthRate = 0
) {
  if (annualAmount === 0) {
    return 0;
  }

  const combinedFactor =
    ((1 + growthRate) * (1 - annualReturnRate)) / (1 + discountRate);
  const effectiveDenominator = discountRate + annualReturnRate - growthRate;

  if (years === Infinity) {
    if (effectiveDenominator <= 0) {
      return Infinity;
    }
    return annualAmount / effectiveDenominator;
  }

  if (Math.abs(effectiveDenominator) < 1e-12) {
    return annualAmount * years;
  }

  return (
    (annualAmount * (1 - Math.pow(combinedFactor, years))) /
    effectiveDenominator
  );
}

/**
 * Calculate the net fiscal impact of the CA billionaire wealth tax.
 *
 * @param {Object} params
 * @param {number} params.grossWealthTaxB - Gross wealth tax before avoidance ($B)
 * @param {number} params.avoidanceRate - Fraction of tax base lost to avoidance (0-1)
 * @param {number} params.moverIncomeTaxB - Annual CA income tax lost from movers ($B)
 * @param {number} params.horizonYears - Years of lost income tax (Infinity = perpetuity)
 * @param {number} params.discountRate - Real discount rate (0-1)
 * @param {number} params.annualReturnRate - Annual return rate of movers still away (0-1)
 * @param {number} params.growthRate - Annual real growth rate of billionaire wealth/income (0-1)
 * @returns {Object} Fiscal impact breakdown
 */
export function calculateFiscalImpact({
  grossWealthTaxB = 0,
  avoidanceRate = 0.1,
  moverIncomeTaxB = 0,
  horizonYears = Infinity,
  discountRate = 0.03,
  annualReturnRate = 0,
  growthRate = 0,
}) {
  const wealthTaxCollected = grossWealthTaxB * (1 - avoidanceRate);
  const annualIncomeTaxLost = moverIncomeTaxB;

  const pvLostIncomeTax = presentValueWithReturnHazard(
    annualIncomeTaxLost,
    discountRate,
    annualReturnRate,
    horizonYears,
    growthRate
  );
  const netFiscalImpact = wealthTaxCollected - pvLostIncomeTax;

  return {
    grossWealthTaxB,
    wealthTaxCollected,
    annualIncomeTaxLost,
    pvLostIncomeTax,
    netFiscalImpact,
    waterfall: [
      { label: "Gross wealth tax", value: grossWealthTaxB },
      {
        label: "Avoidance",
        value: -(grossWealthTaxB * avoidanceRate),
      },
      {
        label: "Income tax loss (PV)",
        value: -pvLostIncomeTax,
      },
    ],
  };
}
