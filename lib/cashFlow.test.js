import { describe, expect, it } from "vitest";
import { WEALTH_TAX_PAYMENT_MODES } from "./calculator";
import { buildAnnualCashFlows, DEFAULT_CASH_FLOW_START_YEAR } from "./cashFlow";

describe("buildAnnualCashFlows", () => {
  it("spreads wealth tax over installment years and starts PIT loss in year 1", () => {
    const result = buildAnnualCashFlows({
      wealthTaxCollected: 80,
      wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS,
      annualIncomeTaxLost: 1,
      annualReturnRate: 0.2,
      discountRate: 0.1,
      horizonYears: 6,
      displayYears: 30,
    });

    // Year 0: first 20% principal installment, no PIT loss yet
    expect(result.rows[0].netCashFlow).toBeCloseTo(16, 6);
    expect(result.rows[0].calendarYear).toBe(DEFAULT_CASH_FLOW_START_YEAR);
    expect(result.rows[0].label).toBe(String(DEFAULT_CASH_FLOW_START_YEAR));
    expect(result.rows[0].relativeYearLabel).toBe("Year 0");
    expect(result.rows[0].incomeTaxLoss).toBeCloseTo(0, 6);

    // Year 1: second installment with deferral charge and first PIT loss
    expect(result.rows[1].wealthTaxReceipt).toBeCloseTo(20.8, 6);
    expect(result.rows[1].incomeTaxLoss).toBeCloseTo(1, 6);
    expect(result.rows[1].netCashFlow).toBeCloseTo(19.8, 6);

    // Year 5: no more wealth tax receipt
    expect(result.rows[5].wealthTaxReceipt).toBeCloseTo(0, 6);

    // Income tax loss decays with return hazard
    expect(result.rows[2].incomeTaxLoss).toBeCloseTo(0.8, 6);
    expect(result.rows[3].incomeTaxLoss).toBeCloseTo(0.64, 6);
  });
});
