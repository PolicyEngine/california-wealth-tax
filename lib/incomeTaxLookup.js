/**
 * Estimate CA income tax using precomputed PolicyEngine lookup.
 * Lookup is keyed by year, each year has income/ca_tax/eff_ca_rate entries.
 * Interpolates linearly between points; extrapolates using nearest effective rate.
 *
 * @param {number} annualIncomeB - Annual income in billions
 * @param {Object} lookup - Keyed by year string, each an array of {income, ca_tax, eff_ca_rate}
 * @param {number} [year=2026] - Tax year
 * @returns {number} CA income tax in billions
 */
export function estimateCaliforniaIncomeTaxB(annualIncomeB, lookup, year = 2026) {
  if (!Number.isFinite(annualIncomeB) || annualIncomeB <= 0) {
    return 0;
  }

  const annualIncome = annualIncomeB * 1e9;

  if (!lookup) {
    return annualIncome * 0.133 / 1e9;
  }

  // Find the closest year in the lookup
  const yearKey = String(year);
  const yearKeys = Object.keys(lookup).sort();
  const points =
    lookup[yearKey] ??
    lookup[yearKeys[yearKeys.length - 1]] ??
    Object.values(lookup)[0];

  if (!points?.length) {
    return annualIncome * 0.133 / 1e9; // fallback
  }

  const sorted = [...points].sort((a, b) => a.income - b.income);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (annualIncome <= first.income) {
    return (annualIncome * first.eff_ca_rate) / 1e9;
  }

  if (annualIncome >= last.income) {
    return (annualIncome * last.eff_ca_rate) / 1e9;
  }

  for (let i = 1; i < sorted.length; i++) {
    if (annualIncome <= sorted[i].income) {
      const lo = sorted[i - 1];
      const hi = sorted[i];
      const weight = (annualIncome - lo.income) / (hi.income - lo.income);
      const tax = lo.ca_tax + (hi.ca_tax - lo.ca_tax) * weight;
      return tax / 1e9;
    }
  }

  return (annualIncome * last.eff_ca_rate) / 1e9;
}
