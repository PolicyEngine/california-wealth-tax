/**
 * Pure fiscal impact calculator — no API calls, just math.
 * All PE-dependent data is precomputed and loaded as static JSON.
 */

const DEFAULT_BASELINE_WEALTH_TAX_B = 94.2;
const RETURN_MIGRATION_WINDOW_YEARS = 5;

function presentValue(annualAmount, discountRate, years) {
  if (annualAmount === 0) {
    return 0;
  }

  if (years === Infinity) {
    return annualAmount / discountRate;
  }

  return annualAmount * (1 - Math.pow(1 + discountRate, -years)) / discountRate;
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
 * @param {number} params.returnRate - Fraction of departees who return within 5 years (0-1)
 * @returns {Object} Fiscal impact breakdown
 */
export function calculateFiscalImpact({
  baselineWealthTaxB = DEFAULT_BASELINE_WEALTH_TAX_B,
  avoidanceRate = 0.1,
  departureRate = 0.3,
  annualIncomeTaxB = 4.3,
  horizonYears = Infinity,
  discountRate = 0.03,
  returnRate = 0,
}) {
  // Wealth tax collected
  const afterAvoidance = baselineWealthTaxB * (1 - avoidanceRate);
  const wealthTaxCollected = afterAvoidance * (1 - departureRate);

  // Initial annual income tax loss assumes all departees stop paying in year 1.
  const annualIncomeTaxLost = departureRate * annualIncomeTaxB;
  const permanentDepartureRate = departureRate * (1 - returnRate);
  const returningDepartureRate = departureRate * returnRate;
  const returnYears =
    horizonYears === Infinity
      ? RETURN_MIGRATION_WINDOW_YEARS
      : Math.min(RETURN_MIGRATION_WINDOW_YEARS, horizonYears);

  const pvPermanentIncomeTaxLoss = presentValue(
    permanentDepartureRate * annualIncomeTaxB,
    discountRate,
    horizonYears
  );
  const pvTemporaryIncomeTaxLoss = presentValue(
    returningDepartureRate * annualIncomeTaxB,
    discountRate,
    returnYears
  );
  const pvLostIncomeTax = pvPermanentIncomeTaxLoss + pvTemporaryIncomeTaxLoss;

  const netFiscalImpact = wealthTaxCollected - pvLostIncomeTax;

  return {
    baselineWealth: baselineWealthTaxB,
    afterAvoidance,
    wealthTaxCollected,
    annualIncomeTaxLost,
    pvPermanentIncomeTaxLoss,
    pvTemporaryIncomeTaxLoss,
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
