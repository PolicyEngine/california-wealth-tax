/**
 * Pure fiscal impact calculator — no API calls, just math.
 * All PE-dependent data is precomputed and loaded as static JSON.
 */

export const WEALTH_TAX_PAYMENT_MODES = {
  LUMP_SUM: "lumpSum",
  INSTALLMENTS: "installments",
};

export const WEALTH_TAX_INSTALLMENT_YEARS = 5;
export const WEALTH_TAX_INSTALLMENT_DEFERRAL_CHARGE_RATE = 0.075;

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

export function buildWealthTaxReceiptSchedule({
  wealthTaxCollected,
  paymentMode = WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
  installmentYears = WEALTH_TAX_INSTALLMENT_YEARS,
  deferralChargeRate = WEALTH_TAX_INSTALLMENT_DEFERRAL_CHARGE_RATE,
}) {
  if (wealthTaxCollected === 0) {
    return [{ year: 0, receipt: 0, principalReceipt: 0, deferralCharge: 0 }];
  }

  if (
    paymentMode !== WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS ||
    installmentYears <= 1
  ) {
    return [
      {
        year: 0,
        receipt: wealthTaxCollected,
        principalReceipt: wealthTaxCollected,
        deferralCharge: 0,
      },
    ];
  }

  const annualPrincipalReceipt = wealthTaxCollected / installmentYears;

  return Array.from({ length: installmentYears }, (_, year) => {
    const remainingUnpaidBalance =
      wealthTaxCollected - annualPrincipalReceipt * year;
    const deferralCharge =
      year === 0 ? 0 : remainingUnpaidBalance * deferralChargeRate;

    return {
      year,
      receipt: annualPrincipalReceipt + deferralCharge,
      principalReceipt: annualPrincipalReceipt,
      deferralCharge,
    };
  });
}

function presentValueOfReceipts(schedule, discountRate) {
  return schedule.reduce(
    (sum, entry) => sum + entry.receipt / Math.pow(1 + discountRate, entry.year),
    0
  );
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
 * @param {number} params.grossWealthTaxB - Gross wealth tax before non-migration erosion ($B)
 * @param {number} params.avoidanceRate - Fraction of tax base lost to non-migration erosion (0-1)
 * @param {number} params.moverIncomeTaxB - Annual CA income tax lost from movers ($B)
 * @param {number} params.horizonYears - Years of lost income tax (Infinity = perpetuity)
 * @param {number} params.discountRate - Real discount rate (0-1)
 * @param {number} params.annualReturnRate - Annual return rate of movers still away (0-1)
 * @param {number} params.growthRate - Annual real growth rate of billionaire wealth/income (0-1)
 * @param {string} params.wealthTaxPaymentMode - Payment timing for the wealth tax
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
  wealthTaxPaymentMode = WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
}) {
  const wealthTaxCollected = grossWealthTaxB * (1 - avoidanceRate);
  const annualIncomeTaxLost = moverIncomeTaxB;
  const wealthTaxReceiptSchedule = buildWealthTaxReceiptSchedule({
    wealthTaxCollected,
    paymentMode: wealthTaxPaymentMode,
  });
  const wealthTaxDeferralChargeB = wealthTaxReceiptSchedule.reduce(
    (sum, entry) => sum + entry.deferralCharge,
    0
  );
  const wealthTaxNominalReceiptsB = wealthTaxReceiptSchedule.reduce(
    (sum, entry) => sum + entry.receipt,
    0
  );
  const pvWealthTaxReceipts = presentValueOfReceipts(
    wealthTaxReceiptSchedule,
    discountRate
  );

  const pvLostIncomeTax = presentValueWithReturnHazard(
    annualIncomeTaxLost,
    discountRate,
    annualReturnRate,
    horizonYears,
    growthRate
  );
  const netFiscalImpact = pvWealthTaxReceipts - pvLostIncomeTax;
  const paymentTimingAdjustment = pvWealthTaxReceipts - wealthTaxCollected;

  const waterfall = [
    { label: "Static wealth tax", value: grossWealthTaxB },
    {
      label: "Non-migration erosion",
      value: -(grossWealthTaxB * avoidanceRate),
    },
  ];

  if (Math.abs(paymentTimingAdjustment) > 1e-9) {
    waterfall.push({
      label: "Payment timing + charge",
      value: paymentTimingAdjustment,
    });
  }

  waterfall.push({
    label: "Income tax loss (PV)",
    value: -pvLostIncomeTax,
  });

  return {
    grossWealthTaxB,
    wealthTaxCollected,
    wealthTaxNominalReceiptsB,
    wealthTaxDeferralChargeB,
    pvWealthTaxReceipts,
    annualIncomeTaxLost,
    pvLostIncomeTax,
    netFiscalImpact,
    wealthTaxReceiptSchedule,
    waterfall,
  };
}
