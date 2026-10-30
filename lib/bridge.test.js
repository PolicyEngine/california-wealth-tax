import { describe, expect, it } from "vitest";
import {
  ASSUMPTION_GROUPS,
  berkeleyToHooverBridge,
  bridgeOriginFor,
  resolveBridge,
  scenarioBridge,
  shapleyBridge,
} from "./bridge";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  snapshotSourceDate,
} from "./microModel";
import {
  BASELINE_ASSUMPTIONS,
  BERKELEY_ASSUMPTIONS,
  HOOVER_ASSUMPTIONS,
  HOOVER_MARCH_2026_ASSUMPTIONS,
} from "./presets";
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
      sourceDate: snapshotSourceDate("2026-09-18"),
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

  it("explains the whole gap with the six groups that differ", () => {
    const total = bridge.contributions.reduce((sum, c) => sum + c.value, 0);

    // Jaros and Rauh's NBER version predicts no unannounced departures, so
    // the migration group matches the Berkeley set and the legal group enters.
    expect(bridge.contributions.map((c) => c.id)).toEqual([
      "residency",
      "incomeTax",
      "incomeAllocation",
      "erosion",
      "legal",
      "valuation",
    ]);
    expect(total).toBeCloseTo(bridge.endValue - bridge.startValue, 9);
  });

  it("keeps the paper's six groups for Rauh et al.'s March 2026 version", () => {
    const march = berkeleyToHooverBridge(score, HOOVER_MARCH_2026_ASSUMPTIONS);
    const total = march.contributions.reduce((sum, c) => sum + c.value, 0);

    expect(march.contributions.map((c) => c.id)).toEqual([
      "residency",
      "migration",
      "incomeTax",
      "incomeAllocation",
      "erosion",
      "valuation",
    ]);
    expect(total).toBeCloseTo(march.endValue - march.startValue, 9);
  });

  it("finds valuation smallest and the wealth allocation of income tax costly", () => {
    const ranked = [...bridge.contributions].sort(
      (a, b) => Math.abs(b.value) - Math.abs(a.value)
    );

    expect(ranked.at(-1).id).toBe("valuation");
    expect(
      bridge.contributions.find((c) => c.id === "incomeAllocation").value
    ).toBeLessThan(0);
  });

  it("covers every scenario parameter except the data date", () => {
    const covered = new Set(ASSUMPTION_GROUPS.flatMap((group) => group.keys));

    for (const key of Object.keys(BASELINE_ASSUMPTIONS)) {
      expect(covered.has(key), `${key} belongs to no assumption group`).toBe(true);
    }
  });

  it("bridges the baseline to itself with no bars", () => {
    const same = scenarioBridge({
      start: BASELINE_ASSUMPTIONS,
      end: BASELINE_ASSUMPTIONS,
      score,
    });

    expect(same.contributions).toHaveLength(0);
    expect(same.startValue).toBeCloseTo(same.endValue, 9);
  });

  it("refuses to bridge across data dates", () => {
    expect(() =>
      scenarioBridge({
        start: { snapshotDate: "2025-10-17", ...BASELINE_ASSUMPTIONS },
        end: { snapshotDate: "2026-09-17", ...HOOVER_ASSUMPTIONS },
        score,
      })
    ).toThrow(/same data date/);
  });
});

describe("resolveBridge", () => {
  const SETS = ["baseline", "berkeley", "hoover"];
  const ENDPOINTS = [...SETS, "your"];
  const pairs = ENDPOINTS.flatMap((from) =>
    ENDPOINTS.filter((to) => to !== from).map((to) => ({ from, to }))
  );

  it("leaves the endpoints alone while a scenario exists", () => {
    for (const { from, to } of pairs) {
      for (const displacedTo of SETS) {
        expect(resolveBridge(from, to, null, displacedTo)).toEqual({ from, to });
      }
    }
  });

  it("never names your scenario, or one endpoint twice, without a scenario", () => {
    for (const { from, to } of pairs) {
      for (const activeSet of SETS) {
        for (const displacedTo of SETS) {
          const resolved = resolveBridge(from, to, activeSet, displacedTo);

          expect(resolved.from).not.toBe("your");
          expect(resolved.to).not.toBe("your");
          expect(resolved.from).not.toBe(resolved.to);
        }
      }
    }
  });

  it("restores the destination an edit displaced when the edit is undone", () => {
    expect(resolveBridge("berkeley", "your", "baseline", "hoover")).toEqual({
      from: "berkeley",
      to: "hoover",
    });
  });

  it("moves the origin when the restored destination would equal it", () => {
    expect(resolveBridge("hoover", "your", "baseline", "hoover")).toEqual({
      from: bridgeOriginFor("hoover", "hoover"),
      to: "hoover",
    });
  });
});
