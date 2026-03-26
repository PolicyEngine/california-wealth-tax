export function estimateCaliforniaIncomeTaxB(annualIncomeB, lookup) {
  if (!Number.isFinite(annualIncomeB)) {
    return 0;
  }

  const annualIncome = annualIncomeB * 1e9;

  if (annualIncome <= 0) {
    return 0;
  }

  if (!lookup?.length) {
    throw new Error("Income tax lookup is required");
  }

  const sortedLookup = [...lookup].sort((left, right) => left.income - right.income);
  const firstPoint = sortedLookup[0];
  const lastPoint = sortedLookup[sortedLookup.length - 1];

  if (annualIncome <= firstPoint.income) {
    return (annualIncome * firstPoint.eff_ca_rate) / 1e9;
  }

  for (let index = 1; index < sortedLookup.length; index += 1) {
    const lowerPoint = sortedLookup[index - 1];
    const upperPoint = sortedLookup[index];

    if (annualIncome <= upperPoint.income) {
      const span = upperPoint.income - lowerPoint.income;
      const weight = (annualIncome - lowerPoint.income) / span;
      const interpolatedTax =
        lowerPoint.ca_tax + (upperPoint.ca_tax - lowerPoint.ca_tax) * weight;

      return interpolatedTax / 1e9;
    }
  }

  return (annualIncome * lastPoint.eff_ca_rate) / 1e9;
}
