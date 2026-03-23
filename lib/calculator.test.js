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
      returnRate: 0,
    });

    expect(result.wealthTaxCollected).toBeCloseTo(98.55, 6);
    expect(result.netFiscalImpact).toBeCloseTo(98.55, 6);
  });

  it("prices returnees as a temporary income-tax loss instead of zero", () => {
    const result = calculateFiscalImpact({
      baselineWealthTaxB: 100,
      avoidanceRate: 0,
      departureRate: 0.2,
      annualIncomeTaxB: 5,
      horizonYears: Infinity,
      discountRate: 0.05,
      returnRate: 0.25,
    });

    const permanentLossPv = 0.75 / 0.05;
    const temporaryLossPv =
      0.25 * (1 - Math.pow(1.05, -5)) / 0.05;

    expect(result.annualIncomeTaxLost).toBeCloseTo(1, 6);
    expect(result.pvPermanentIncomeTaxLoss).toBeCloseTo(permanentLossPv, 6);
    expect(result.pvTemporaryIncomeTaxLoss).toBeCloseTo(temporaryLossPv, 6);
    expect(result.pvLostIncomeTax).toBeCloseTo(
      permanentLossPv + temporaryLossPv,
      6
    );
  });
});
