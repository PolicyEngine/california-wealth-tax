import {
  buildWealthTaxReceiptSchedule,
  WEALTH_TAX_INSTALLMENT_DEFERRAL_CHARGE_RATE,
  WEALTH_TAX_INSTALLMENT_YEARS,
  WEALTH_TAX_PAYMENT_MODES,
} from "./calculator";

export const DEFAULT_CASH_FLOW_START_YEAR = 2026;

export function buildAnnualCashFlows({
  wealthTaxCollected,
  wealthTaxPaymentMode = WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
  annualIncomeTaxLost,
  annualReturnRate,
  discountRate,
  horizonYears,
  displayYears,
  startYear = DEFAULT_CASH_FLOW_START_YEAR,
  growthRate = 0,
  wealthTaxInstallmentYears = WEALTH_TAX_INSTALLMENT_YEARS,
  wealthTaxInstallmentDeferralChargeRate =
    WEALTH_TAX_INSTALLMENT_DEFERRAL_CHARGE_RATE,
}) {
  const wealthTaxReceiptSchedule = buildWealthTaxReceiptSchedule({
    wealthTaxCollected,
    paymentMode: wealthTaxPaymentMode,
    installmentYears: wealthTaxInstallmentYears,
    deferralChargeRate: wealthTaxInstallmentDeferralChargeRate,
  });
  const wealthTaxScheduleByYear = new Map(
    wealthTaxReceiptSchedule.map((entry) => [entry.year, entry])
  );
  const lastWealthTaxYear =
    wealthTaxReceiptSchedule[wealthTaxReceiptSchedule.length - 1]?.year ?? 0;
  const finalYear = Math.max(
    lastWealthTaxYear,
    horizonYears === Infinity
      ? displayYears
      : Math.min(displayYears, horizonYears)
  );
  const rows = [];
  let cumulativeNetCashFlow = 0;
  let cumulativeDiscountedNet = 0;

  for (let year = 0; year <= finalYear; year += 1) {
    const stillAwayShare = year === 0 ? 1 : Math.pow(1 - annualReturnRate, year - 1);
    const growthFactor = year <= 1 ? 1 : Math.pow(1 + growthRate, year - 1);
    const wealthTaxReceipt = wealthTaxScheduleByYear.get(year)?.receipt ?? 0;
    const discountedWealthTaxReceipt =
      wealthTaxReceipt / Math.pow(1 + discountRate, year);
    const incomeTaxLoss =
      year === 0 ? 0 : annualIncomeTaxLost * stillAwayShare * growthFactor;
    const discountedIncomeTaxLoss =
      incomeTaxLoss / Math.pow(1 + discountRate, year);
    const netCashFlow = wealthTaxReceipt - incomeTaxLoss;
    const discountedNetCashFlow =
      discountedWealthTaxReceipt - discountedIncomeTaxLoss;

    cumulativeNetCashFlow += netCashFlow;
    cumulativeDiscountedNet += discountedNetCashFlow;

    rows.push({
      year,
      calendarYear: startYear + year,
      label: String(startYear + year),
      relativeYearLabel: `Year ${year}`,
      wealthTaxReceipt,
      discountedWealthTaxReceipt,
      netCashFlow,
      discountedNetCashFlow,
      cumulativeNetCashFlow,
      cumulativeDiscountedNet,
      incomeTaxLoss,
      discountedIncomeTaxLoss,
      stillAwayShare,
    });
  }

  return {
    rows,
    isTruncated: horizonYears === Infinity || horizonYears > finalYear,
    displayedYears: finalYear,
  };
}
