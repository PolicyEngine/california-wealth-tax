/**
 * Pure fiscal impact calculator — no API calls, just math.
 * All PE-dependent data is precomputed and loaded as static JSON.
 */

const DEFAULT_BASELINE_WEALTH_TAX_B = 94.2;
const FIVE_YEAR_WINDOW = 5;

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

  // Each year the loss is: amount * (1+g)^t * (1-r)^t / (1+d)^t
  // Combined factor per year: (1+g)(1-r)/(1+d)
  const combinedFactor =
    ((1 + growthRate) * (1 - annualReturnRate)) / (1 + discountRate);
  const effectiveDenominator = discountRate + annualReturnRate - growthRate;

  if (years === Infinity) {
    // Converges only if combinedFactor < 1, i.e. growth < discount + return
    if (effectiveDenominator <= 0) {
      return Infinity;
    }
    return annualAmount / effectiveDenominator;
  }

  if (Math.abs(effectiveDenominator) < 1e-12) {
    // Degenerate case: growth exactly offsets discount + return → linear sum
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
 * @param {number} params.baselineWealthTaxB - Gross one-time wealth tax score before behavior ($B)
 * @param {number} params.avoidanceRate - Fraction of tax base lost to avoidance (0-1)
 * @param {number} params.departureRate - Fraction of billionaires who leave (0-1)
 * @param {number} params.annualIncomeTaxB - Annual CA income tax from billionaires ($B)
 * @param {number} params.horizonYears - Years of lost income tax (Infinity = perpetuity)
 * @param {number} params.discountRate - Real discount rate (0-1)
 * @param {number} params.annualReturnRate - Annual return rate of movers still away (0-1)
 * @param {number} params.growthRate - Annual real growth rate of billionaire wealth/income (0-1)
 * @returns {Object} Fiscal impact breakdown
 */
export function calculateFiscalImpact({
  baselineWealthTaxB = DEFAULT_BASELINE_WEALTH_TAX_B,
  avoidanceRate = 0.1,
  departureRate = 0.3,
  annualIncomeTaxB = 4.3,
  horizonYears = Infinity,
  discountRate = 0.03,
  annualReturnRate = 0,
  growthRate = 0,
}) {
  // Wealth tax collected
  const afterAvoidance = baselineWealthTaxB * (1 - avoidanceRate);
  const wealthTaxCollected = afterAvoidance * (1 - departureRate);

  // Initial annual income tax loss assumes all departees stop paying in year 1.
  const annualIncomeTaxLost = departureRate * annualIncomeTaxB;
  const fiveYearReturnShare =
    1 - Math.pow(1 - annualReturnRate, FIVE_YEAR_WINDOW);

  const pvLostIncomeTax = presentValueWithReturnHazard(
    annualIncomeTaxLost,
    discountRate,
    annualReturnRate,
    horizonYears,
    growthRate
  );
  const netFiscalImpact = wealthTaxCollected - pvLostIncomeTax;

  return {
    baselineWealth: baselineWealthTaxB,
    afterAvoidance,
    wealthTaxCollected,
    annualIncomeTaxLost,
    fiveYearReturnShare,
    pvLostIncomeTax,
    netFiscalImpact,
    // Waterfall steps for chart
    waterfall: [
      { label: "Baseline", value: baselineWealthTaxB },
      {
        label: "Avoidance",
        value: -(baselineWealthTaxB * avoidanceRate),
      },
      {
        label: "Departures (wealth tax)",
        value: -(afterAvoidance * departureRate),
      },
      {
        label: "Income tax loss (PV)",
        value: -pvLostIncomeTax,
      },
    ],
  };
}
