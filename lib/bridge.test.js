import { describe, expect, it } from "vitest";
import {
  BERKELEY_TO_HOOVER_FACTORS,
  berkeleyToHooverBridge,
  shapleyBridge,
} from "./bridge";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
} from "./microModel";
import { BERKELEY_ASSUMPTIONS, HOOVER_ASSUMPTIONS } from "./presets";
import { scoreScenario } from "./scenario";
import incomeTaxLookup from "../data/income_tax_lookup.json";
import metadata from "../data/billionaire_metadata.json";
import rosterRows from "../public/snapshots/2026-01-01.json";
import rosterValuations from "../paper/data/roster_valuations_2026-09-18.json";
import snapshotRows from "../public/snapshots/2026-09-18.json";

describe("shapleyBridge", () => {
  const factors = [
    { id: "a", label: "A", keys: ["a"] },
    { id: "b", label: "B", keys: ["b"] },
    { id: "c", label: "C", keys: ["c"] },
  ];

  it("recovers each term of an additive metric exactly, with no order range", () => {
    const bridge = shapleyBridge({
      start: { a: 0, b: 0, c: 0 },
      end: { a: 1, b: 1, c: 1 },
      factors,
      evaluate: (p) => 10 + 5 * p.a - 3 * p.b + 0 * p.c,
    });

    expect(bridge.startValue).toBe(10);
    expect(bridge.endValue).toBe(12);
    expect(bridge.contributions.map((c) => c.value)).toEqual([5, -3, 0]);
    expect(bridge.contributions.every((c) => c.min === c.max)).toBe(true);
  });

  it("splits an interaction evenly and reports the range across orderings", () => {
    const bridge = shapleyBridge({
      start: { a: 0, b: 0, c: 0 },
      end: { a: 1, b: 1, c: 1 },
      factors,
      evaluate: (p) => 8 * p.a * p.b,
    });
    const [a, b, c] = bridge.contributions;

    expect(a.value).toBeCloseTo(4, 9);
    expect(b.value).toBeCloseTo(4, 9);
    expect(c.value).toBeCloseTo(0, 9);
    expect([a.min, a.max]).toEqual([0, 8]);
  });

  it("always sums to the gap between the two scenarios", () => {
    const bridge = shapleyBridge({
      start: { a: 1, b: 2, c: 3 },
      end: { a: 4, b: 1, c: 7 },
      factors,
      evaluate: (p) => p.a * p.b - Math.sqrt(p.c) * p.a + p.b ** p.c / 50,
    });
    const total = bridge.contributions.reduce((sum, c) => sum + c.value, 0);

    expect(total).toBeCloseTo(bridge.endValue - bridge.startValue, 9);
  });

  it("refuses factors that leave a difference unexplained", () => {
    expect(() =>
      shapleyBridge({
        start: { a: 0, b: 0, c: 0, d: 0 },
        end: { a: 1, b: 1, c: 1, d: 1 },
        factors,
        evaluate: () => 0,
      })
    ).toThrow(/do not cover every difference: d/);
  });
});

describe("berkeleyToHooverBridge on the September 17, 2026 snapshot", () => {
  const rows = buildResidencyRosterValuationRows({
    residencyRows: annotateBillionaires({
      billionaires: rosterRows,
      metadata,
      snapshotDate: "2026-01-01",
    }),
    valuationRows: annotateBillionaires({
      billionaires: snapshotRows,
      metadata,
      snapshotDate: "2026-09-18",
    }),
    rosterValuations,
    includeNewEntrants: true,
  });
  const score = (params) =>
    scoreScenario({
      params,
      rows,
      incomeTaxLookup,
      sourceDate: new Date("2026-09-18T00:00:00"),
    });
  const bridge = berkeleyToHooverBridge(score);

  it("starts and ends at the two assumption sets' own scores", () => {
    expect(bridge.startValue).toBeCloseTo(
      score(BERKELEY_ASSUMPTIONS).result.netFiscalImpact,
      9
    );
    expect(bridge.endValue).toBeCloseTo(
      score(HOOVER_ASSUMPTIONS).result.netFiscalImpact,
      9
    );
    expect(bridge.startValue).toBeGreaterThan(100);
    expect(bridge.endValue).toBeLessThan(0);
  });

  it("explains the whole gap with the five named assumptions", () => {
    const total = bridge.contributions.reduce((sum, c) => sum + c.value, 0);

    expect(bridge.contributions).toHaveLength(BERKELEY_TO_HOOVER_FACTORS.length);
    expect(total).toBeCloseTo(bridge.endValue - bridge.startValue, 9);
  });

  it("finds the income-tax assumption largest and real estate smallest", () => {
    const ranked = [...bridge.contributions].sort(
      (a, b) => Math.abs(b.value) - Math.abs(a.value)
    );

    expect(ranked[0].id).toBe("incomeTax");
    expect(ranked.at(-1).id).toBe("realEstate");
  });
});
