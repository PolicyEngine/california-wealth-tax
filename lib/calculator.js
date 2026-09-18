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
// Cash flows are indexed in years from 2026, the valuation year. The tax is
// reported and due with the 2026 income tax return (RTC §50301(c)), and
// §50312(i) contemplates estimated payments in April 2027 and final payments
// in October 2027, so the first receipt arrives in year 1. Income-tax losses
// are indexed the same way: the first lost return is also filed in 2027.
export const WEALTH_TAX_FIRST_PAYMENT_YEAR = 1;

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
  firstPaymentYear = WEALTH_TAX_FIRST_PAYMENT_YEAR,
}) {
  if (wealthTaxCollected === 0) {
    return [
      {
        year: firstPaymentYear,
        receipt: 0,
        principalReceipt: 0,
        deferralCharge: 0,
      },
    ];
  }

  if (
    paymentMode !== WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS ||
    installmentYears <= 1
  ) {
    return [
      {
        year: firstPaymentYear,
        receipt: wealthTaxCollected,
        principalReceipt: wealthTaxCollected,
        deferralCharge: 0,
      },
    ];
  }

  const annualPrincipalReceipt = wealthTaxCollected / installmentYears;

  return Array.from({ length: installmentYears }, (_, installment) => {
    const remainingUnpaidBalance =
      wealthTaxCollected - annualPrincipalReceipt * installment;
    const deferralCharge =
      installment === 0 ? 0 : remainingUnpaidBalance * deferralChargeRate;

    return {
      year: firstPaymentYear + installment,
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

/**
 * Present value of a stream that starts at `annualAmount` in year 1, grows at
 * `growthRate`, and shrinks at `annualReturnRate` as movers return:
 *
 *   sum over t = 1..years of A * q^(t-1) / (1 + d), with q = (1+g)(1-r)/(1+d)
 *   = A * (1 - q^years) / ((1 + d) - (1 + g)(1 - r))
 *
 * The denominator is d + r - g + g*r; dropping the g*r term overstates the
 * value whenever both g and r are nonzero. The series converges when q < 1.
 */
export function presentValueWithReturnHazard(
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
  const effectiveDenominator =
    1 + discountRate - (1 + growthRate) * (1 - annualReturnRate);

  if (years === Infinity) {
    if (effectiveDenominator <= 0) {
      return Infinity;
    }
    return annualAmount / effectiveDenominator;
  }

  if (Math.abs(effectiveDenominator) < 1e-12) {
    // q = 1: every year's loss is worth the same as the first.
    return (annualAmount * years) / (1 + discountRate);
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
 * @param {boolean} params.includeIncomeTaxEffects - Whether to include PIT loss in the fiscal impact
 * @param {number} params.incomeTaxAttributionRate - Share of mover PIT loss attributed to the tax episode (0-1)
 * @param {number} params.horizonYears - Years of lost income tax (Infinity = perpetuity)
 * @param {number} params.discountRate - Real discount rate (0-1)
 * @param {number} params.annualReturnRate - Annual return rate of movers still away (0-1)
 * @param {number} params.growthRate - Annual real growth rate of billionaire wealth/income (0-1)
 * @param {string} params.wealthTaxPaymentMode - Payment timing for the wealth tax
 * @returns {Object} Fiscal impact breakdown. `headlineValue` is nominal
 *   receipts when income-tax effects are off and net present value when on.
 */
export function calculateFiscalImpact({
  grossWealthTaxB = 0,
  avoidanceRate = 0.1,
  moverIncomeTaxB = 0,
  includeIncomeTaxEffects = true,
  incomeTaxAttributionRate = 1,
  horizonYears = Infinity,
  discountRate = 0.03,
  annualReturnRate = 0,
  growthRate = 0,
  wealthTaxPaymentMode = WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
}) {
  const wealthTaxCollected = grossWealthTaxB * (1 - avoidanceRate);
  const annualIncomeTaxLost = includeIncomeTaxEffects
    ? moverIncomeTaxB * incomeTaxAttributionRate
    : 0;
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
  // Stage 1 alone is a revenue score: nominal receipts, as a budget table
  // would show them. Stage 2 compares a one-time receipt with a stream of
  // losses, so both legs move to present value as of 2026.
  const headlineValue = includeIncomeTaxEffects
    ? netFiscalImpact
    : wealthTaxNominalReceiptsB;

  const waterfall = [
    { label: "Static wealth tax", value: grossWealthTaxB },
    {
      label: "Non-migration erosion",
      value: -(grossWealthTaxB * avoidanceRate),
    },
  ];

  if (includeIncomeTaxEffects) {
    if (Math.abs(paymentTimingAdjustment) > 1e-9) {
      waterfall.push({
        label:
          wealthTaxDeferralChargeB > 0
            ? "Payment timing + charge (PV)"
            : "Discounting to 2027 due date",
        value: paymentTimingAdjustment,
      });
    }

    if (pvLostIncomeTax > 0) {
      waterfall.push({
        label: "Income tax loss (PV)",
        value: -pvLostIncomeTax,
      });
    }
  } else if (wealthTaxDeferralChargeB > 0) {
    waterfall.push({
      label: "Installment deferral charges",
      value: wealthTaxDeferralChargeB,
    });
  }

  return {
    grossWealthTaxB,
    wealthTaxCollected,
    wealthTaxNominalReceiptsB,
    wealthTaxDeferralChargeB,
    pvWealthTaxReceipts,
    includeIncomeTaxEffects,
    incomeTaxAttributionRate,
    annualIncomeTaxLost,
    pvLostIncomeTax,
    netFiscalImpact,
    headlineValue,
    wealthTaxReceiptSchedule,
    waterfall,
  };
}
