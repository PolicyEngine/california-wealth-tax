import { describe, expect, it } from "vitest";
import { buildAnnualCashFlows, DEFAULT_CASH_FLOW_START_YEAR } from "./cashFlow";

describe("buildAnnualCashFlows", () => {
  it("spreads wealth tax over installment years", () => {
    const result = buildAnnualCashFlows({
      wealthTaxCollected: 80,
      annualIncomeTaxLost: 1,
      annualReturnRate: 0.2,
      discountRate: 0.1,
      horizonYears: 6,
      displayYears: 30,
    });

    // 80B over 5 years = 16B/yr
    expect(result.rows[0].netCashFlow).toBeCloseTo(16, 6);
    expect(result.rows[0].calendarYear).toBe(DEFAULT_CASH_FLOW_START_YEAR);
    expect(result.rows[0].label).toBe(String(DEFAULT_CASH_FLOW_START_YEAR));
    expect(result.rows[0].relativeYearLabel).toBe("Year 0");

    // Year 1: 16B wealth tax receipt - 1B income tax loss = 15B
    expect(result.rows[1].wealthTaxReceipt).toBeCloseTo(16, 6);
    expect(result.rows[1].incomeTaxLoss).toBeCloseTo(1, 6);
    expect(result.rows[1].netCashFlow).toBeCloseTo(15, 6);

    // Year 5: no more wealth tax receipt
    expect(result.rows[5].wealthTaxReceipt).toBeCloseTo(0, 6);

    // Income tax loss decays with return hazard
    expect(result.rows[2].incomeTaxLoss).toBeCloseTo(0.8, 6);
    expect(result.rows[3].incomeTaxLoss).toBeCloseTo(0.64, 6);
  });
});
