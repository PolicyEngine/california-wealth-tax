import { describe, expect, it } from "vitest";
import {
  calculateFiscalImpact,
  effectiveWealthTaxRate,
  WEALTH_TAX_PAYMENT_MODES,
} from "./calculator";

describe("effectiveWealthTaxRate", () => {
  it("returns 0 at or below $1B", () => {
    expect(effectiveWealthTaxRate(1.0)).toBe(0);
    expect(effectiveWealthTaxRate(0.5)).toBe(0);
  });

  it("returns 5% at or above $1.1B", () => {
    expect(effectiveWealthTaxRate(1.1)).toBe(0.05);
    expect(effectiveWealthTaxRate(10)).toBe(0.05);
  });

  it("phases in linearly between $1B and $1.1B", () => {
    expect(effectiveWealthTaxRate(1.05)).toBeCloseTo(0.025, 6);
    expect(effectiveWealthTaxRate(1.02)).toBeCloseTo(0.01, 6);
  });
});

describe("calculateFiscalImpact", () => {
  it("computes wealth tax collected after avoidance", () => {
    const result = calculateFiscalImpact({
      grossWealthTaxB: 100,
      avoidanceRate: 0.1,
      moverIncomeTaxB: 0,
    });

    expect(result.wealthTaxCollected).toBeCloseTo(90, 6);
    expect(result.netFiscalImpact).toBeCloseTo(90, 6);
  });

  it("can exclude PIT effects entirely", () => {
    const result = calculateFiscalImpact({
      grossWealthTaxB: 80,
      avoidanceRate: 0,
      moverIncomeTaxB: 2,
      includeIncomeTaxEffects: false,
    });

    expect(result.annualIncomeTaxLost).toBe(0);
    expect(result.pvLostIncomeTax).toBe(0);
    expect(result.netFiscalImpact).toBeCloseTo(80, 6);
    expect(result.waterfall.map((step) => step.label)).not.toContain(
      "Income tax loss (PV)"
    );
  });

  it("applies a PIT attribution share before discounting", () => {
    const result = calculateFiscalImpact({
      grossWealthTaxB: 80,
      avoidanceRate: 0,
      moverIncomeTaxB: 2,
      includeIncomeTaxEffects: true,
      incomeTaxAttributionRate: 0.25,
      horizonYears: 1,
      discountRate: 0,
    });

    expect(result.annualIncomeTaxLost).toBeCloseTo(0.5, 6);
    expect(result.pvLostIncomeTax).toBeCloseTo(0.5, 6);
    expect(result.netFiscalImpact).toBeCloseTo(79.5, 6);
  });

  it("computes PV of income tax loss from movers with return hazard", () => {
    const result = calculateFiscalImpact({
      grossWealthTaxB: 80,
      avoidanceRate: 0,
      moverIncomeTaxB: 1,
      horizonYears: 3,
      discountRate: 0.1,
      annualReturnRate: 0.2,
    });

    const expectedPv =
      1 / 1.1 + 0.8 / Math.pow(1.1, 2) + 0.64 / Math.pow(1.1, 3);

    expect(result.annualIncomeTaxLost).toBeCloseTo(1, 6);
    expect(result.pvLostIncomeTax).toBeCloseTo(expectedPv, 6);
    expect(result.netFiscalImpact).toBeCloseTo(80 - expectedPv, 6);
  });

  it("models five annual installments with the statutory deferral charge", () => {
    const result = calculateFiscalImpact({
      grossWealthTaxB: 100,
      avoidanceRate: 0,
      moverIncomeTaxB: 0,
      discountRate: 0.1,
      wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS,
    });

    const expectedPv =
      20 +
      26 / 1.1 +
      24.5 / Math.pow(1.1, 2) +
      23 / Math.pow(1.1, 3) +
      21.5 / Math.pow(1.1, 4);

    expect(result.wealthTaxCollected).toBeCloseTo(100, 6);
    expect(result.wealthTaxDeferralChargeB).toBeCloseTo(15, 6);
    expect(result.wealthTaxNominalReceiptsB).toBeCloseTo(115, 6);
    expect(result.pvWealthTaxReceipts).toBeCloseTo(expectedPv, 6);
    expect(result.netFiscalImpact).toBeCloseTo(expectedPv, 6);
  });
});
