import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  INCOME_TAX_METHODS,
  snapshotSourceDate,
} from "./microModel";
import { DEPARTURE_RESPONSE_MODES } from "./departureResponse";
import {
  BASELINE_ASSUMPTIONS,
  HOOVER_ASSUMPTIONS,
  HOOVER_MARCH_2026_ASSUMPTIONS,
} from "./presets";
import { heatmapCaption, heatmapEvaluator } from "./heatmap";
import { scoreScenario } from "./scenario";
import { PAPER_SNAPSHOT_DATE } from "./paperNumbers";
import metadata from "../data/billionaire_metadata.json";
import incomeTaxLookup from "../data/income_tax_lookup.json";
import rosterRows from "../public/snapshots/2026-01-01.json";

const read = (path) =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const rows = buildResidencyRosterValuationRows({
  residencyRows: annotateBillionaires({ billionaires: rosterRows, metadata, snapshotDate: "2026-01-01" }),
  valuationRows: annotateBillionaires({
    billionaires: read(`public/snapshots/${PAPER_SNAPSHOT_DATE}.json`),
    metadata,
    snapshotDate: PAPER_SNAPSHOT_DATE,
  }),
  rosterValuations: read(`paper/data/roster_valuations_${PAPER_SNAPSHOT_DATE}.json`),
  includeNewEntrants: true,
});
const sourceDate = snapshotSourceDate(PAPER_SNAPSHOT_DATE);
const npv = (params) =>
  scoreScenario({ params, rows, incomeTaxLookup, sourceDate }).result.netFiscalImpact;

describe("scoreScenario", () => {
  it("is bilinear in the unannounced share and the cohort total, so four corners give the heatmap", () => {
    // The legal settings scale or remove receipts and leave the grid bilinear;
    // only a total departure share bends it (next test).
    for (const base of [
      BASELINE_ASSUMPTIONS,
      HOOVER_MARCH_2026_ASSUMPTIONS,
      { ...HOOVER_ASSUMPTIONS, incomeTaxDepartureShare: 0 },
    ]) {
      for (const method of [INCOME_TAX_METHODS.WEALTH, INCOME_TAX_METHODS.FILINGS]) {
        const f = (share, cohortIncomeTaxB) =>
          npv({
            ...base,
            includeIncomeTaxEffects: true,
            departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
            unannouncedDepartureShare: share,
            incomeTaxMethod: method,
            cohortIncomeTaxB,
          });
        const [f00, f10, f01, f11] = [f(0, 1), f(1, 1), f(0, 8), f(1, 8)];
        const bilinear = (s, c) => {
          const v = (c - 1) / 7;
          return f00 * (1 - s) * (1 - v) + f10 * s * (1 - v) + f01 * (1 - s) * v + f11 * s * v;
        };

        for (const share of [0.15, 0.4, 0.85]) {
          for (const cohort of [2.5, 4.55, 7]) {
            expect(f(share, cohort)).toBeCloseTo(bilinear(share, cohort), 8);
          }
        }
      }
    }
  });

  const shares = Array.from({ length: 21 }, (_, i) => i * 0.05);
  const cohorts = Array.from({ length: 15 }, (_, i) => 1 + i * 0.5);
  const cellScore = (base, method) => (share, cohortIncomeTaxB, incomeTaxDepartureShare) => {
    const { result } = scoreScenario({
      params: {
        ...base,
        includeIncomeTaxEffects: true,
        departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
        unannouncedDepartureShare: share,
        incomeTaxMethod: method,
        cohortIncomeTaxB,
        incomeTaxDepartureShare,
      },
      rows,
      incomeTaxLookup,
      sourceDate,
    });
    return { npv: result.netFiscalImpact, pvReceipts: result.pvWealthTaxReceipts };
  };

  it("gives every heatmap cell exactly from corners, with or without a total departure share", () => {
    const bases = [
      HOOVER_ASSUMPTIONS,
      { ...HOOVER_ASSUMPTIONS, residencyExclusionIds: [] },
      {
        ...HOOVER_ASSUMPTIONS,
        incomeTaxAttributionRate: 0.5,
        annualReturnRate: 0.05,
        horizonYears: 25,
        incomeGrowthRate: 0.01,
        litigationSurvivalRate: 0.3,
      },
      { ...BASELINE_ASSUMPTIONS, residencyExclusionIds: ["page", "zuckerberg"], includeNonCitizens: false },
    ];
    let worst = 0;
    let bent = 0;

    for (const base of bases) {
      for (const method of [INCOME_TAX_METHODS.WEALTH, INCOME_TAX_METHODS.FILINGS]) {
        for (const target of [0, 0.45, 1]) {
          const exact = cellScore(base, method);
          const grid = heatmapEvaluator(exact, shares, cohorts, target);
          // Every other cell keeps the run short; the kink crosses them.
          for (const share of shares.filter((_, i) => i % 2 === 0)) {
            for (const cohort of cohorts.filter((_, i) => i % 2 === 0)) {
              const direct = exact(share, cohort, target).npv;
              worst = Math.max(worst, Math.abs(grid(share, cohort) - direct));
              if (target > 0) {
                bent = Math.max(bent, Math.abs(exact(share, cohort, 0).npv - direct));
              }
            }
          }
        }
      }
    }

    expect(worst).toBeLessThan(1e-9);
    // The target does bend the surface, so the comparison has teeth.
    expect(bent).toBeGreaterThan(1);
  }, 60000);

  it("matches direct scoring where the lost income tax diverges", () => {
    // Growth at the discount rate with no return hazard: the perpetuity does
    // not converge, so the grids fall back to direct scores or diverge whole.
    for (const base of [
      { ...HOOVER_ASSUMPTIONS, incomeGrowthRate: 0.03 },
      { ...HOOVER_ASSUMPTIONS, discountRate: 0, incomeGrowthRate: 0 },
    ]) {
      for (const target of [0, 0.45]) {
        const exact = cellScore(base, INCOME_TAX_METHODS.WEALTH);
        const grid = heatmapEvaluator(exact, shares, cohorts, target);
        for (const share of [0, 0.35, 1]) {
          for (const cohort of [1, 4.5, 8]) {
            expect(grid(share, cohort)).toBe(exact(share, cohort, target).npv);
          }
        }
      }
    }
  }, 60000);

  it("says why the grids agree, and only where they do", () => {
    const params = { ...HOOVER_ASSUMPTIONS, incomeTaxDepartureShare: 1 };
    const grids = [INCOME_TAX_METHODS.WEALTH, INCOME_TAX_METHODS.FILINGS].map((method) =>
      heatmapEvaluator(cellScore(params, method), shares, cohorts, 1)
    );
    const coincide = shares.every((share) =>
      cohorts.every((cohort) => Math.abs(grids[0](share, cohort) - grids[1](share, cohort)) < 0.05)
    );

    expect(coincide).toBe(true);
    expect(heatmapCaption({ coincide, departureClaimApplied: true, targetShare: 1 })).toContain(
      "total departure share of 100% sets the income tax lost in every cell"
    );
    const agreesShortOfAll = (target) => {
      const pair = [INCOME_TAX_METHODS.WEALTH, INCOME_TAX_METHODS.FILINGS].map((method) =>
        heatmapEvaluator(cellScore({ ...HOOVER_ASSUMPTIONS, incomeTaxDepartureShare: target }, method), shares, cohorts, target)
      );
      return shares
        .filter((share) => share < 1)
        .some((share) => cohorts.some((cohort) => Math.abs(pair[0](share, cohort) - pair[1](share, cohort)) < 0.05));
    };

    // At 45% the target binds at low unannounced shares; at Jaros and Rauh's
    // 30% low end it binds nowhere on this roster, and the caption says less.
    expect(agreesShortOfAll(0.45)).toBe(true);
    expect(agreesShortOfAll(0.3)).toBe(false);
    expect(
      heatmapCaption({ coincide: false, departureClaimApplied: true, targetShare: 0.45, agreesWhereTargetBinds: true })
    ).toContain("the division does not matter and the grids agree");
    expect(
      heatmapCaption({ coincide: false, departureClaimApplied: true, targetShare: 0.3, agreesWhereTargetBinds: false })
    ).not.toContain("grids agree");
  }, 60000);
});
