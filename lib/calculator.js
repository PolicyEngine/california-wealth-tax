/**
 * Pure fiscal impact calculator — no API calls, just math.
 * All PE-dependent data is precomputed and loaded as static JSON.
 */

// Rauh's corrected baseline (after residency + real estate adjustments)
const BASELINE_WEALTH_TAX_B = 94.2;

/**
 * Calculate the net fiscal impact of the CA billionaire wealth tax.
 *
 * @param {Object} params
 * @param {number} params.avoidanceRate - Fraction of tax base lost to avoidance (0-1)
 * @param {number} params.departureRate - Fraction of billionaires who leave (0-1)
 * @param {number} params.annualIncomeTaxB - Annual CA income tax from billionaires ($B)
 * @param {number} params.horizonYears - Years of lost income tax (Infinity = perpetuity)
 * @param {number} params.discountRate - Real discount rate (0-1)
 * @param {number} params.returnRate - Fraction of departees who return within 5 years (0-1)
 * @returns {Object} Fiscal impact breakdown
 */
export function calculateFiscalImpact({
  avoidanceRate = 0.1,
  departureRate = 0.3,
  annualIncomeTaxB = 4.3,
  horizonYears = Infinity,
  discountRate = 0.03,
  returnRate = 0,
}) {
  // Wealth tax collected
  const afterAvoidance = BASELINE_WEALTH_TAX_B * (1 - avoidanceRate);
  const wealthTaxCollected = afterAvoidance * (1 - departureRate);

  // Annual income tax lost from departures
  const effectiveDepartureRate = departureRate * (1 - returnRate);
  const annualIncomeTaxLost = effectiveDepartureRate * annualIncomeTaxB;

  // PV of lost income tax
  let pvLostIncomeTax;
  if (horizonYears === Infinity) {
    // Gordon growth perpetuity
    pvLostIncomeTax = annualIncomeTaxLost / discountRate;
  } else {
    // Finite annuity: PV = C * [1 - (1+r)^-n] / r
    pvLostIncomeTax =
      annualIncomeTaxLost *
      (1 - Math.pow(1 + discountRate, -horizonYears)) /
      discountRate;
  }

  const netFiscalImpact = wealthTaxCollected - pvLostIncomeTax;

  return {
    baselineWealth: BASELINE_WEALTH_TAX_B,
    afterAvoidance,
    wealthTaxCollected,
    annualIncomeTaxLost,
    pvLostIncomeTax,
    netFiscalImpact,
    // Waterfall steps for chart
    waterfall: [
      { label: "Baseline", value: BASELINE_WEALTH_TAX_B },
      {
        label: "Avoidance",
        value: -(BASELINE_WEALTH_TAX_B * avoidanceRate),
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
