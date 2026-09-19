import { describe, expect, it } from "vitest";
import { bilinearGrid } from "./heatmap";
import { BASELINE_ASSUMPTIONS } from "./presets";
import { scoreScenario } from "./scenario";

describe("heatmap interpolation", () => {
  it("preserves finite zero-departure edges when the departing stream diverges", () => {
    for (const incomeTaxMethod of ["wealth", "filings"]) {
      for (const discountRate of [0, 0.03]) {
        const evaluate = (unannouncedDepartureShare, cohortIncomeTaxB) => scoreScenario({
          params: { ...BASELINE_ASSUMPTIONS, includeIncomeTaxEffects: true, discountRate,
            incomeGrowthRate: discountRate, incomeTaxMethod, unannouncedDepartureShare, cohortIncomeTaxB },
          rows: [{ name: "Resident", netWorth: 2e9, realEstate: 0, realEstateObserved: true }],
          sourceDate: new Date("2026-09-18"),
        }).result.netFiscalImpact;
        const grid = bilinearGrid(evaluate, [0, 1], [1, 8]);
        expect(grid(0, 4.3)).toBeCloseTo(0.1 / (1 + discountRate), 12);
        expect(grid(0.5, 4.3)).toBe(-Infinity);
      }
    }
  });
  it("interpolates finite bilinear functions", () => {
    const f = (x, y) => 7 + 2*x + 3*y + x*y;
    expect(bilinearGrid(f, [0, 1], [1, 8])(0.25, 4.3)).toBeCloseTo(f(0.25, 4.3), 12);
  });
});
