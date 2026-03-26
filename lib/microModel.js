import { effectiveWealthTaxRate } from "./calculator";
import { estimateCaliforniaIncomeTaxB } from "./incomeTaxLookup";

/**
 * Compute per-billionaire and aggregate values from microdata.
 */
export function computeMicroResults({
  billionaires,
  incomeTaxLookup,
  wealthBase,
  excludeRealEstate,
  incomeYieldRate,
}) {
  const includeMovers = wealthBase !== "afterDepartures";

  const rows = billionaires.map((b) => {
    const netWorthB = b.netWorth / 1e9;
    const reB = (excludeRealEstate ? b.realEstate : 0) / 1e9;
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

  const grossWealthTaxB = stayers.reduce((s, r) => s + r.grossTaxB, 0);
  const moverIncomeTaxB = movers.reduce((s, r) => s + r.annualIncomeTaxB, 0);

  return { rows, stayers, movers, grossWealthTaxB, moverIncomeTaxB };
}
