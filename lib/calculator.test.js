import { describe, expect, it } from "vitest";
import { calculateFiscalImpact } from "./calculator";

describe("calculateFiscalImpact", () => {
  it("respects the scenario-specific baseline wealth tax score", () => {
    const result = calculateFiscalImpact({
      baselineWealthTaxB: 109.5,
      avoidanceRate: 0.1,
      departureRate: 0,
      annualIncomeTaxB: 2.9,
      horizonYears: Infinity,
      discountRate: 0.03,
      annualReturnRate: 0,
    });

    expect(result.wealthTaxCollected).toBeCloseTo(98.55, 6);
    expect(result.netFiscalImpact).toBeCloseTo(98.55, 6);
  });

  it("models return migration as an annual hazard on remaining movers", () => {
    const result = calculateFiscalImpact({
      baselineWealthTaxB: 100,
      avoidanceRate: 0,
      departureRate: 0.2,
      annualIncomeTaxB: 5,
      horizonYears: 3,
      discountRate: 0.1,
      annualReturnRate: 0.2,
    });

    const expectedPv =
      1 / 1.1 + 0.8 / Math.pow(1.1, 2) + 0.64 / Math.pow(1.1, 3);

    expect(result.annualIncomeTaxLost).toBeCloseTo(1, 6);
    expect(result.fiveYearReturnShare).toBeCloseTo(1 - Math.pow(0.8, 5), 6);
    expect(result.pvLostIncomeTax).toBeCloseTo(expectedPv, 6);
    expect(result.netFiscalImpact).toBeCloseTo(80 - expectedPv, 6);
  });
});
