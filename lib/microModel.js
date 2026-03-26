import { effectiveWealthTaxRate } from "./calculator";
import { estimateCaliforniaIncomeTaxB } from "./incomeTaxLookup";

export const DATA_SOURCE_DATE = new Date("2025-10-17");
export const VALUATION_DATE = new Date("2026-12-31");

function yearsBetween(from, to) {
  return (to - from) / (365.25 * 24 * 60 * 60 * 1000);
}

/**
 * Compute per-billionaire and aggregate values from microdata.
 */
export function computeMicroResults({
  billionaires,
  incomeTaxLookup,
  wealthBase,
  excludeRealEstate,
  incomeYieldRate,
  wealthGrowthRate = 0,
  unannouncedDepartureShare = 0,
}) {
  const includeMovers = wealthBase !== "afterDepartures";
  const years = yearsBetween(DATA_SOURCE_DATE, VALUATION_DATE);
  const growthFactor =
    wealthGrowthRate > 0 ? Math.pow(1 + wealthGrowthRate, years) : 1;

  const rows = billionaires.map((b) => {
    const rawNetWorthB = b.netWorth / 1e9;
    const netWorthB = rawNetWorthB * growthFactor;
    const reB = (excludeRealEstate ? b.realEstate : 0) / 1e9 * growthFactor;
    const taxableWealthB = Math.max(0, netWorthB - reB);
    const rate = effectiveWealthTaxRate(taxableWealthB);
    const grossTaxB = taxableWealthB * rate;
    const annualIncomeB = taxableWealthB * incomeYieldRate;
    const annualIncomeTaxB = estimateCaliforniaIncomeTaxB(
      annualIncomeB,
      incomeTaxLookup
    );
    const inBase = includeMovers || !b.moved;

    return {
      name: b.name,
      moved: b.moved,
      inBase,
      netWorthB,
      taxableWealthB,
      rate,
      grossTaxB,
      annualIncomeB,
      annualIncomeTaxB,
    };
  });

  const stayers = rows.filter((r) => r.inBase);
  const movers = rows.filter((r) => r.moved && !r.inBase);

  const stayerGrossWealthTaxB = stayers.reduce((s, r) => s + r.grossTaxB, 0);
  const stayerIncomeTaxB = stayers.reduce(
    (s, r) => s + r.annualIncomeTaxB,
    0
  );
  const moverIncomeTaxB = movers.reduce((s, r) => s + r.annualIncomeTaxB, 0);

  // Unannounced departures: share of stayer wealth that also left
  // Reduces wealth tax proportionally, adds to income tax loss proportionally
  const unannouncedWealthTaxLossB =
    stayerGrossWealthTaxB * unannouncedDepartureShare;
  const unannouncedIncomeTaxB =
    stayerIncomeTaxB * unannouncedDepartureShare;

  const grossWealthTaxB = stayerGrossWealthTaxB - unannouncedWealthTaxLossB;
  const totalMoverIncomeTaxB = moverIncomeTaxB + unannouncedIncomeTaxB;

  return {
    rows,
    stayers,
    movers,
    grossWealthTaxB,
    moverIncomeTaxB: totalMoverIncomeTaxB,
    unannouncedWealthTaxLossB,
    unannouncedIncomeTaxB,
  };
}
