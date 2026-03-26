export const DEFAULT_CASH_FLOW_START_YEAR = 2026;

export function buildAnnualCashFlows({
  wealthTaxCollected,
  annualIncomeTaxLost,
  annualReturnRate,
  discountRate,
  horizonYears,
  displayYears,
  startYear = DEFAULT_CASH_FLOW_START_YEAR,
  growthRate = 0,
}) {
  const finalYear =
    horizonYears === Infinity
      ? displayYears
      : Math.min(displayYears, horizonYears);
  const rows = [];
  let cumulativeNetCashFlow = wealthTaxCollected;
  let cumulativeDiscountedNet = wealthTaxCollected;

  rows.push({
    year: 0,
    calendarYear: startYear,
    label: String(startYear),
    relativeYearLabel: "Year 0",
    netCashFlow: wealthTaxCollected,
    discountedNetCashFlow: wealthTaxCollected,
    cumulativeNetCashFlow,
    cumulativeDiscountedNet,
    incomeTaxLoss: 0,
    discountedIncomeTaxLoss: 0,
    stillAwayShare: 1,
  });

  for (let year = 1; year <= finalYear; year += 1) {
    const stillAwayShare = Math.pow(1 - annualReturnRate, year - 1);
    const growthFactor = Math.pow(1 + growthRate, year);
    const incomeTaxLoss = annualIncomeTaxLost * stillAwayShare * growthFactor;
    const discountedIncomeTaxLoss =
      incomeTaxLoss / Math.pow(1 + discountRate, year);
    const netCashFlow = -incomeTaxLoss;
    const discountedNetCashFlow = -discountedIncomeTaxLoss;

    cumulativeNetCashFlow += netCashFlow;
    cumulativeDiscountedNet += discountedNetCashFlow;

    rows.push({
      year,
      calendarYear: startYear + year,
      label: String(startYear + year),
      relativeYearLabel: `Year ${year}`,
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
