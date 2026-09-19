import { describe, expect, it } from "vitest";
import {
  calculateFiscalImpact,
  presentValueWithReturnHazard,
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
    expect(result.wealthTaxNominalReceiptsB).toBeCloseTo(90, 6);
    // The lump sum is due with the 2026 return, in 2027: one year of discounting.
    expect(result.pvWealthTaxReceipts).toBeCloseTo(90 / 1.03, 6);
    expect(result.netFiscalImpact).toBeCloseTo(90 / 1.03, 6);
  });

  it("headlines nominal receipts when income-tax effects are off", () => {
    const result = calculateFiscalImpact({
      grossWealthTaxB: 100,
      avoidanceRate: 0,
      moverIncomeTaxB: 3,
      includeIncomeTaxEffects: false,
      discountRate: 0.03,
    });

    expect(result.headlineValue).toBeCloseTo(100, 6);
    expect(result.waterfall.map((step) => step.label)).toEqual([
      "Static wealth tax",
      "Non-migration erosion",
    ]);
  });

  it("headlines net present value when income-tax effects are on", () => {
    const result = calculateFiscalImpact({
      grossWealthTaxB: 100,
      avoidanceRate: 0,
      moverIncomeTaxB: 1.5,
      includeIncomeTaxEffects: true,
      discountRate: 0.03,
    });

    // Both legs start in 2027: 100 / 1.03 of receipts against a perpetuity
    // of 1.5 a year whose first lost return is also filed in 2027.
    expect(result.pvLostIncomeTax).toBeCloseTo(1.5 / 0.03, 6);
    expect(result.headlineValue).toBeCloseTo(100 / 1.03 - 50, 6);
    expect(result.headlineValue).toBe(result.netFiscalImpact);
    expect(result.waterfall.map((step) => step.label)).toEqual([
      "Static wealth tax",
      "Non-migration erosion",
      "Discounting to 2027 due date",
      "Income tax loss (PV)",
    ]);
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
    expect(result.headlineValue).toBeCloseTo(80, 6);
    expect(result.netFiscalImpact).toBeCloseTo(80 / 1.03, 6);
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
    expect(result.netFiscalImpact).toBeCloseTo(80 / 1.1 - expectedPv, 6);
  });

  it("models five annual installments with the statutory deferral charge", () => {
    const result = calculateFiscalImpact({
      grossWealthTaxB: 100,
      avoidanceRate: 0,
      moverIncomeTaxB: 0,
      discountRate: 0.1,
      wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS,
    });

    // Installments run 2027-2031: years 1 through 5 from the 2026 base year.
    const expectedPv =
      20 / 1.1 +
      26 / Math.pow(1.1, 2) +
      24.5 / Math.pow(1.1, 3) +
      23 / Math.pow(1.1, 4) +
      21.5 / Math.pow(1.1, 5);

    expect(result.wealthTaxCollected).toBeCloseTo(100, 6);
    expect(result.wealthTaxDeferralChargeB).toBeCloseTo(15, 6);
    expect(result.wealthTaxNominalReceiptsB).toBeCloseTo(115, 6);
    expect(result.wealthTaxReceiptSchedule.map((entry) => entry.year)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(result.pvWealthTaxReceipts).toBeCloseTo(expectedPv, 6);
    expect(result.netFiscalImpact).toBeCloseTo(expectedPv, 6);
  });
});

describe("presentValueWithReturnHazard", () => {
  function bruteForce(amount, d, r, years, g) {
    let sum = 0;
    for (let t = 1; t <= years; t += 1) {
      sum +=
        (amount * Math.pow((1 + g) * (1 - r), t - 1)) / Math.pow(1 + d, t);
    }
    return sum;
  }

  it("matches a brute-force sum across the slider grid, growth and return both nonzero", () => {
    for (const d of [0, 0.005, 0.03, 0.05]) {
      for (const r of [0, 0.05, 0.2, 0.5]) {
        for (const g of [-0.05, 0, 0.02, 0.05]) {
          for (const years of [1, 10, 100]) {
            expect(presentValueWithReturnHazard(1, d, r, years, g)).toBeCloseTo(
              bruteForce(1, d, r, years, g),
              9
            );
          }
        }
      }
    }
  });

  it("returns a finite perpetuity whenever the series converges", () => {
    // d = 0, r = 5%, g = 5%: q = 1.05 * 0.95 = 0.9975 < 1, so the perpetuity
    // converges to 1 / (1 - 0.9975) = 400. The old denominator d + r - g = 0
    // reported it as infinite.
    expect(presentValueWithReturnHazard(1, 0, 0.05, Infinity, 0.05)).toBeCloseTo(
      400,
      6
    );
    expect(presentValueWithReturnHazard(1, 0.005, 0.05, Infinity, 0.05)).toBeCloseTo(
      1 / (1.005 - 1.05 * 0.95),
      9
    );
    expect(presentValueWithReturnHazard(1, 0.03, 0.05, Infinity, 0.02)).toBeCloseTo(
      1 / (1.03 - 1.02 * 0.95),
      9
    );
  });

  it("diverges only when the per-year factor is at least one", () => {
    expect(presentValueWithReturnHazard(1, 0.01, 0, Infinity, 0.02)).toBe(Infinity);
    expect(presentValueWithReturnHazard(1, 0.02, 0, Infinity, 0.02)).toBe(Infinity);
    expect(presentValueWithReturnHazard(1, 0.02, 0, 10, 0.02)).toBeCloseTo(10 / 1.02, 9);
  });
});
