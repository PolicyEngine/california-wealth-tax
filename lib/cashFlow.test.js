import { describe, expect, it } from "vitest";
import { buildAnnualCashFlows, DEFAULT_CASH_FLOW_START_YEAR } from "./cashFlow";

describe("buildAnnualCashFlows", () => {
  it("builds a year-by-year net cash flow path with return hazard and discounting", () => {
    const result = buildAnnualCashFlows({
      wealthTaxCollected: 80,
      annualIncomeTaxLost: 1,
      annualReturnRate: 0.2,
      discountRate: 0.1,
      horizonYears: 3,
      displayYears: 30,
    });

    expect(result.displayedYears).toBe(3);
    expect(result.isTruncated).toBe(false);
    expect(result.rows[0].netCashFlow).toBeCloseTo(80, 6);
    expect(result.rows[0].calendarYear).toBe(DEFAULT_CASH_FLOW_START_YEAR);
    expect(result.rows[0].label).toBe(String(DEFAULT_CASH_FLOW_START_YEAR));
    expect(result.rows[0].relativeYearLabel).toBe("Year 0");
    expect(result.rows[1].incomeTaxLoss).toBeCloseTo(1, 6);
    expect(result.rows[1].calendarYear).toBe(DEFAULT_CASH_FLOW_START_YEAR + 1);
    expect(result.rows[2].incomeTaxLoss).toBeCloseTo(0.8, 6);
    expect(result.rows[3].incomeTaxLoss).toBeCloseTo(0.64, 6);
    expect(result.rows[3].cumulativeDiscountedNet).toBeCloseTo(
      80 - (1 / 1.1 + 0.8 / Math.pow(1.1, 2) + 0.64 / Math.pow(1.1, 3)),
      6
    );
  });
});
