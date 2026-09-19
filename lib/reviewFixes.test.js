import { describe, expect, it } from "vitest";
import { calculateFiscalImpact, WEALTH_TAX_PAYMENT_MODES } from "./calculator";
import { computeMicroResults, INCOME_TAX_METHODS } from "./microModel";
import { BASELINE_ASSUMPTIONS } from "./presets";
import { parseScenarioParams, serializeScenarioParams } from "./scenarioUrl";

describe("price basis", () => {
  it("deflates nominal installment receipts before discounting, without deflating real income losses", () => {
    const params = { grossWealthTaxB: 100, avoidanceRate: 0, moverIncomeTaxB: 3,
      discountRate: 0.03, horizonYears: 5, wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS };
    const result = calculateFiscalImpact({ ...params, inflationRate: 0.02 });
    // $20B principal each year; charges are 7.5% of the unpaid balance.
    const receipts = [20, 26, 24.5, 23, 21.5];
    const expected = receipts.reduce((sum, amount, i) => sum + amount / (1.02 * 1.03) ** (i + 1), 0);
    expect(result.pvWealthTaxReceipts).toBeCloseTo(expected, 10);
    expect(result.pvLostIncomeTax).toBeCloseTo([1, 2, 3, 4, 5].reduce((sum, t) => sum + 3 / 1.03 ** t, 0), 10);
    expect(result.wealthTaxNominalReceiptsB).toBe(115);
    expect(calculateFiscalImpact({ ...params, inflationRate: 0 })).toEqual(calculateFiscalImpact(params));
  });
  it("round trips inflation through shared scenarios", () => {
    const params = { ...BASELINE_ASSUMPTIONS, inflationRate: 0.02 };
    expect(parseScenarioParams(serializeScenarioParams(params, BASELINE_ASSUMPTIONS), BASELINE_ASSUMPTIONS)).toEqual(params);
  });
});

describe("known spouses as one statutory wealth-tax unit", () => {
  const pair = [
    { name: "Jay-Z", netWorth: 600e6, realEstate: 0, realEstateObserved: true },
    { name: "Beyoncé Knowles-Carter", netWorth: 450e6, realEstate: 0, realEstateObserved: true },
  ];
  const run = (overrides = {}) => computeMicroResults({ billionaires: pair, excludedNames: [],
    excludeRealEstate: true, incomeYieldRate: 0.02, ...overrides });
  it("applies the combined $1.05B phase-in and allocates liability without duplicate assets", () => {
    const result = run();
    expect(result.grossWealthTaxB).toBeCloseTo(1.05 * 0.025, 12);
    expect(result.wealthTaxBaseRows).toHaveLength(2);
    expect(result.rows.map((row) => row.belowThreshold)).toEqual([false, false]);
    expect(result.rows[0].grossTaxB).toBeCloseTo(0.6 * 0.025, 12);
    expect(result.rows[1].grossTaxB).toBeCloseTo(0.45 * 0.025, 12);
    expect(run({ billionaires: [...pair].reverse() }).grossWealthTaxB).toBeCloseTo(result.grossWealthTaxB, 12);
    expect(run({ unannouncedDepartureShare: 0.4 }).grossWealthTaxB).toBeCloseTo(result.grossWealthTaxB * 0.6, 12);
  });
  it("keeps worldwide spousal assets when one spouse is excluded, removing tax only when both leave", () => {
    const baseline = run();
    expect(run({ excludedNames: [pair[0].name] }).grossWealthTaxB).toBeCloseTo(baseline.grossWealthTaxB, 12);
    expect(run({ excludedNames: pair.map((row) => row.name) }).grossWealthTaxB).toBe(0);
    expect(run({ postSnapshotMoverNames: [pair[0].name], unannouncedDepartureShare: 1 }).grossWealthTaxB).toBeCloseTo(baseline.grossWealthTaxB, 12);
    expect(run({ excludedNames: [pair[0].name] }).knownDepartureIncomeTaxB).toBeCloseTo(baseline.rows[0].annualIncomeTaxB, 12);
  });
  it("leaves person-level income allocation unchanged", () => {
    const rows = pair.map((row) => ({ ...row, netWorth: row.netWorth * 3 }));
    const result = run({ billionaires: rows, incomeTaxMethod: INCOME_TAX_METHODS.WEALTH, cohortIncomeTaxB: 4.3 });
    expect(result.rows[0].annualIncomeTaxB).toBeCloseTo(4.3 * 0.6 / 1.05, 12);
    expect(result.rows.reduce((sum, row) => sum + row.annualIncomeTaxB, 0)).toBeCloseTo(4.3, 12);
  });
  it("removes the joint departure loss only after both spouses leave the base", () => {
    const billionaires = pair.map((row) => ({ ...row, departureTiming: "pre_snapshot" }));
    const one = run({ billionaires, excludedNames: [pair[0].name] });
    const both = run({ billionaires, excludedNames: pair.map((row) => row.name) });
    expect(one.observedPreSnapshotDepartureGrossWealthTaxB).toBe(0);
    expect(both.observedPreSnapshotDepartureGrossWealthTaxB).toBeCloseTo(1.05 * 0.025, 12);
    expect(both.correctedBaseGrossWealthTaxB).toBeCloseTo(1.05 * 0.025, 12);
    expect(both.unannouncedDeparturePoolGrossWealthTaxB).toBe(0);
  });
  it("uses the joint threshold and full-rate boundary", () => {
    expect(run({ billionaires: pair.map((row) => ({ ...row, netWorth: 450e6 })) }).wealthTaxBaseRows).toHaveLength(0);
    expect(run({ billionaires: pair.map((row) => ({ ...row, netWorth: 550e6 })) }).grossWealthTaxB).toBeCloseTo(1.1 * 0.05, 12);
  });
  it("keeps income-tax departures independent when a spouse fixes the wealth-tax liability", () => {
    const result = run({
      billionaires: pair.map((row) => ({ ...row, netWorth: 2e9 })),
      postSnapshotMoverNames: [pair[0].name], unannouncedDepartureShare: 1,
      incomeTaxMethod: INCOME_TAX_METHODS.WEALTH, cohortIncomeTaxB: 1,
    });
    expect(result.grossWealthTaxB).toBeCloseTo(4 * 0.05, 12);
    expect(result.knownDepartureIncomeTaxB).toBeCloseTo(0.5, 12);
    expect(result.unannouncedIncomeTaxB).toBeCloseTo(0.5, 12);
    expect(result.moverIncomeTaxB).toBeCloseTo(1, 12);
  });
});
