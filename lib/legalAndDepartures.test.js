/**
 * Invariants for the settings Jaros and Rauh's NBER version needs: the chance
 * the measure survives legal challenge, collecting from people who left after
 * January 1, non-US citizens in the base, and a total share of the cohort's
 * income tax lost to departures.
 */
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calculateFiscalImpact, WEALTH_TAX_PAYMENT_MODES } from "./calculator";
import { scenarioBridge } from "./bridge";
import { DEPARTURE_RESPONSE_MODES } from "./departureResponse";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  citizenshipOf,
  INCOME_TAX_METHODS,
  normalizeName,
  snapshotSourceDate,
} from "./microModel";
import { PAPER_SNAPSHOT_DATE } from "./paperNumbers";
import { BASELINE_ASSUMPTIONS, HOOVER_ASSUMPTIONS } from "./presets";
import {
  POST_SNAPSHOT_MOVER_IDS,
  PRE_SNAPSHOT_EXCLUSION_IDS,
  RESIDENCY_ADJUSTMENTS,
} from "./residencyAdjustments";
import { scoreScenario } from "./scenario";
import { selectSnapshotRows } from "./snapshot";
import { parseScenarioParams, serializeScenarioParams } from "./scenarioUrl";
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
const score = (params) => scoreScenario({ params, rows, incomeTaxLookup, sourceDate });
const RUNS = { numRuns: 150 };

const allIds = RESIDENCY_ADJUSTMENTS.map((adjustment) => adjustment.id);
const idSubset = fc.subarray(allIds);
// Shares on the sliders' 1% grid: fc.double favors values like 1e-10, where a
// wrong term is smaller than any useful tolerance.
const gridShare = (max) => fc.integer({ min: 0, max: Math.round(max * 100) }).map((x) => x / 100);
const stageTwo = fc.record({
  residencyExclusionIds: idSubset,
  unannouncedDepartureShare: gridShare(0.8),
  incomeTaxMethod: fc.constantFrom(
    INCOME_TAX_METHODS.WEALTH,
    INCOME_TAX_METHODS.FILINGS,
    INCOME_TAX_METHODS.YIELD
  ),
  cohortIncomeTaxB: fc.integer({ min: 100, max: 800 }).map((x) => x / 100),
  collectFromPostSnapshotMovers: fc.boolean(),
  includeNonCitizens: fc.boolean(),
});
const scenarioFrom = (overrides) => ({
  ...BASELINE_ASSUMPTIONS,
  includeIncomeTaxEffects: true,
  departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
  ...overrides,
});

describe("litigation survival", () => {
  const inputs = fc.record({
    grossWealthTaxB: fc.double({ min: 0, max: 200, noNaN: true }),
    avoidanceRate: fc.double({ min: 0, max: 0.5, noNaN: true }),
    moverIncomeTaxB: fc.double({ min: 0, max: 6, noNaN: true }),
    discountRate: fc.double({ min: 0.005, max: 0.05, noNaN: true }),
    inflationRate: fc.double({ min: 0, max: 0.05, noNaN: true }),
    wealthTaxPaymentMode: fc.constantFrom(...Object.values(WEALTH_TAX_PAYMENT_MODES)),
  });
  const q = fc.double({ min: 0, max: 1, noNaN: true });

  it("scales expected receipts by the survival probability and leaves the income-tax loss alone", () => {
    fc.assert(
      fc.property(inputs, q, (base, survival) => {
        const certain = calculateFiscalImpact(base);
        const risky = calculateFiscalImpact({ ...base, litigationSurvivalRate: survival });

        expect(risky.wealthTaxCollected).toBeCloseTo(
          base.grossWealthTaxB * (1 - base.avoidanceRate) * survival,
          9
        );
        expect(risky.pvWealthTaxReceipts).toBeCloseTo(certain.pvWealthTaxReceipts * survival, 9);
        expect(risky.pvLostIncomeTax).toBe(certain.pvLostIncomeTax);
      }),
      RUNS
    );
  });

  it("never lowers the net present value as survival becomes more likely", () => {
    fc.assert(
      fc.property(inputs, q, q, (base, a, b) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        const npv = (survival) =>
          calculateFiscalImpact({ ...base, litigationSurvivalRate: survival }).netFiscalImpact;

        expect(npv(low)).toBeLessThanOrEqual(npv(high) + 1e-9);
      }),
      RUNS
    );
  });

  it("is the measure as written at 1, clamps out-of-range input, and itemizes the cut", () => {
    const base = { grossWealthTaxB: 100, avoidanceRate: 0.1, includeIncomeTaxEffects: false };

    expect(calculateFiscalImpact({ ...base, litigationSurvivalRate: 1 })).toEqual(
      calculateFiscalImpact(base)
    );
    expect(calculateFiscalImpact({ ...base, litigationSurvivalRate: 2 }).wealthTaxCollected).toBeCloseTo(90, 9);
    expect(calculateFiscalImpact({ ...base, litigationSurvivalRate: -1 }).wealthTaxCollected).toBe(0);

    const halved = calculateFiscalImpact({ ...base, litigationSurvivalRate: 0.5 });
    const staticSteps = halved.waterfall.reduce((sum, step) => sum + step.value, 0);
    expect(halved.waterfall.map((step) => step.label)).toContain("Litigation risk");
    expect(staticSteps).toBeCloseTo(halved.wealthTaxCollected, 9);
  });
});

describe("total income-tax departure share", () => {
  const f = gridShare(1);

  it("counts modeled departures before January 1 toward the target", () => {
    const params = scenarioFrom({ residencyExclusionIds: ["page"], unannouncedDepartureShare: 0.3 });
    const floor = score(params).result.annualIncomeTaxLost;
    const withTarget = score({ ...params, incomeTaxDepartureShare: 0.6 });
    const target = 0.6 * withTarget.micro.cohortIncomeTaxTotalB;

    expect(target).toBeGreaterThan(floor);
    expect(withTarget.result.annualIncomeTaxLost).toBeCloseTo(target, 9);
    // At or below what departures already take, the target adds nothing.
    expect(score({ ...params, incomeTaxDepartureShare: 0.1 }).result.annualIncomeTaxLost).toBeCloseTo(floor, 9);
  });

  it("loses exactly the larger of what departures already take and the target share", () => {
    fc.assert(
      fc.property(stageTwo, f, (overrides, target) => {
        const without = score(scenarioFrom(overrides));
        const withTarget = score(scenarioFrom({ ...overrides, incomeTaxDepartureShare: target }));
        const floor = without.result.annualIncomeTaxLost;
        const total = withTarget.micro.cohortIncomeTaxTotalB;

        expect(withTarget.result.annualIncomeTaxLost).toBeCloseTo(
          Math.max(floor, target * total),
          9
        );
        // The cohort total is the same with or without the target.
        expect(total).toBeCloseTo(without.micro.cohortIncomeTaxTotalB, 9);
      }),
      RUNS
    );
  });

  it("moves no wealth tax: later movers were residents on January 1", () => {
    fc.assert(
      fc.property(stageTwo, f, (overrides, target) => {
        const without = score(scenarioFrom(overrides));
        const withTarget = score(scenarioFrom({ ...overrides, incomeTaxDepartureShare: target }));

        expect(withTarget.micro.grossWealthTaxB).toBe(without.micro.grossWealthTaxB);
        expect(withTarget.result.pvWealthTaxReceipts).toBe(without.result.pvWealthTaxReceipts);
      }),
      RUNS
    );
  });

  it("never lowers the income tax lost as the target rises", () => {
    fc.assert(
      fc.property(stageTwo, f, f, (overrides, a, b) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        const lost = (target) =>
          score(scenarioFrom({ ...overrides, incomeTaxDepartureShare: target })).result
            .annualIncomeTaxLost;

        expect(lost(low)).toBeLessThanOrEqual(lost(high) + 1e-9);
      }),
      RUNS
    );
  });
});

describe("legal exclusions from the base", () => {
  const grossOf = (micro, predicate) =>
    micro.rows.filter(predicate).reduce((sum, row) => sum + row.grossTaxB, 0);

  it("leaving out people who left after January 1 removes their wealth tax and keeps their income tax lost", () => {
    fc.assert(
      fc.property(fc.subarray(POST_SNAPSHOT_MOVER_IDS, { minLength: 1 }), idSubset, (movers, others) => {
        const ids = [...new Set([...others.filter((id) => !POST_SNAPSHOT_MOVER_IDS.includes(id)), ...movers])];
        const collect = score(scenarioFrom({ residencyExclusionIds: ids }));
        const leaveOut = score(
          scenarioFrom({ residencyExclusionIds: ids, collectFromPostSnapshotMovers: false })
        );
        const names = new Set(
          RESIDENCY_ADJUSTMENTS.filter((a) => movers.includes(a.id)).map((a) => a.name)
        );
        const removed = grossOf(collect.micro, (row) => row.inBase && names.has(row.name));

        expect(collect.micro.grossWealthTaxB - leaveOut.micro.grossWealthTaxB).toBeCloseTo(removed, 9);
        expect(leaveOut.micro.legallyExcludedGrossWealthTaxB).toBeCloseTo(removed, 9);
        expect(leaveOut.micro.moverIncomeTaxB).toBeCloseTo(collect.micro.moverIncomeTaxB, 9);
      }),
      { numRuns: 60 }
    );
  });

  it("has no effect when nobody is marked as leaving after January 1", () => {
    const ids = PRE_SNAPSHOT_EXCLUSION_IDS;
    const collect = score(scenarioFrom({ residencyExclusionIds: ids }));
    const leaveOut = score(scenarioFrom({ residencyExclusionIds: ids, collectFromPostSnapshotMovers: false }));

    expect(leaveOut.result.netFiscalImpact).toBe(collect.result.netFiscalImpact);
  });

  it("leaving out non-US citizens removes exactly their wealth tax and none of the cohort's income tax", () => {
    fc.assert(
      fc.property(stageTwo, (overrides) => {
        const common = { ...overrides, collectFromPostSnapshotMovers: true };
        const included = score(scenarioFrom({ ...common, includeNonCitizens: true }));
        const excluded = score(scenarioFrom({ ...common, includeNonCitizens: false }));
        const removed = grossOf(included.micro, (row) => row.inBase && row.nonCitizen);

        expect(
          included.micro.grossWealthTaxBeforeAdditionalDeparturesB -
            excluded.micro.grossWealthTaxBeforeAdditionalDeparturesB
        ).toBeCloseTo(removed, 9);
        expect(excluded.micro.wealthTaxBaseRows.some((row) => row.nonCitizen)).toBe(false);
        expect(excluded.micro.cohortIncomeTaxTotalB).toBeCloseTo(included.micro.cohortIncomeTaxTotalB, 9);
        expect(excluded.micro.moverIncomeTaxB).toBeCloseTo(included.micro.moverIncomeTaxB, 9);
      }),
      { numRuns: 60 }
    );
  });
});

describe("the Hoover set follows Jaros and Rauh's NBER version", () => {
  const hoover = score(HOOVER_ASSUMPTIONS);
  const byName = new Map(hoover.micro.rows.map((row) => [row.name, row]));

  it("removes their departures, Zuckerberg and non-US citizens from the base", () => {
    for (const name of [
      "Drew Houston",
      "Lynsi Snyder",
      "Larry Page",
      "Sergey Brin",
      "Peter Thiel",
      "Travis Kalanick",
      "Don Hankey",
      "Steven Spielberg",
      "Marc Benioff",
      "Meg Whitman",
      "Frank Slootman",
      "Mark Zuckerberg",
    ]) {
      expect(byName.get(name)?.inBase, name).toBe(false);
    }
    expect(byName.get("Mark Zuckerberg").countsTowardKnownIncomeTaxLoss).toBe(true);
    expect(hoover.micro.wealthTaxBaseRows.some((row) => row.nonCitizen)).toBe(false);
    expect(hoover.modeledAdditionalDepartureShare).toBe(0);
  });

  it("matches their NPV formula: q × receipts − f × C / (r − g), with receipts discounted to 2026", () => {
    const { micro, result } = hoover;
    const receipts = 0.5 * micro.grossWealthTaxB;

    expect(result.wealthTaxNominalReceiptsB).toBeCloseTo(receipts, 9);
    expect(result.annualIncomeTaxLost).toBeCloseTo(0.45 * micro.cohortIncomeTaxTotalB, 9);
    expect(micro.cohortIncomeTaxTotalB).toBeCloseTo(4.55, 6);
    expect(result.netFiscalImpact).toBeCloseTo(
      receipts / 1.03 - (0.45 * micro.cohortIncomeTaxTotalB) / 0.03,
      9
    );
  });

  it("bridges from the statutory score with every step summing to the gap", () => {
    const bridge = scenarioBridge({ start: BASELINE_ASSUMPTIONS, end: HOOVER_ASSUMPTIONS, score });
    const total = bridge.contributions.reduce((sum, step) => sum + step.value, 0);

    expect(bridge.contributions.map((step) => step.id)).toContain("legal");
    expect(total).toBeCloseTo(bridge.endValue - bridge.startValue, 9);
  });
});

describe("links carry the new settings", () => {
  const defaults = { snapshotDate: PAPER_SNAPSHOT_DATE, ...BASELINE_ASSUMPTIONS };

  it("round-trips any value the sliders and switches allow", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.boolean(),
        fc.boolean(),
        (survive, depart, collect, nonCitizens) => {
          const params = {
            ...defaults,
            litigationSurvivalRate: survive / 100,
            incomeTaxDepartureShare: depart / 100,
            collectFromPostSnapshotMovers: collect,
            includeNonCitizens: nonCitizens,
          };
          const parsed = parseScenarioParams(serializeScenarioParams(params, defaults), defaults);

          expect(parsed.litigationSurvivalRate).toBeCloseTo(params.litigationSurvivalRate, 9);
          expect(parsed.incomeTaxDepartureShare).toBeCloseTo(params.incomeTaxDepartureShare, 9);
          expect(parsed.collectFromPostSnapshotMovers).toBe(collect);
          expect(parsed.includeNonCitizens).toBe(nonCitizens);
        }
      ),
      RUNS
    );
  });

  it("round-trips the Hoover set exactly, under stable query keys", () => {
    const params = { ...defaults, ...HOOVER_ASSUMPTIONS };
    const query = serializeScenarioParams(params, defaults);
    const parsed = parseScenarioParams(query, defaults);

    expect(parsed).toEqual(params);
    // Shared links depend on these names.
    expect(Object.fromEntries(["survive", "pitdepart", "postjan", "noncit"].map((key) => [key, query.get(key)]))).toEqual({
      survive: "0.5",
      pitdepart: "0.45",
      postjan: "0",
      noncit: "0",
    });
  });

  it("leaves links to the default settings unchanged", () => {
    expect(serializeScenarioParams(defaults, defaults).toString()).toBe("");
  });
});

describe("legal switches across every departure mode and income-tax division", () => {
  const grid = (min, max, step) =>
    fc.integer({ min: Math.round(min / step), max: Math.round(max / step) }).map((x) => x * step);
  const anyScenario = fc.record({
    residencyExclusionIds: idSubset,
    departureResponseMode: fc.constantFrom(...Object.values(DEPARTURE_RESPONSE_MODES)),
    unannouncedDepartureShare: gridShare(0.8),
    migrationSemiElasticity: grid(0, 30, 0.5),
    incomeTaxMethod: fc.constantFrom(...Object.values(INCOME_TAX_METHODS)),
    cohortIncomeTaxB: grid(1, 8, 0.25),
    incomeYieldRate: grid(0.005, 0.05, 0.005),
    incomeTaxDepartureShare: gridShare(1),
    litigationSurvivalRate: gridShare(1),
    avoidanceRate: gridShare(0.5),
    wealthGrowthRate: grid(-0.2, 0.2, 0.01),
    incomeTaxAttributionRate: gridShare(1),
    wealthTaxPaymentMode: fc.constantFrom(...Object.values(WEALTH_TAX_PAYMENT_MODES)),
    collectFromPostSnapshotMovers: fc.boolean(),
    includeNonCitizens: fc.boolean(),
  });
  const withIncomeTax = (overrides) => ({ ...BASELINE_ASSUMPTIONS, includeIncomeTaxEffects: true, ...overrides });
  const switches = ["collectFromPostSnapshotMovers", "includeNonCitizens"];
  const SWEEP = { numRuns: 120 };

  it("never raise the net present value by leaving people out, and never move the income tax lost", () => {
    fc.assert(
      fc.property(anyScenario, fc.constantFrom(...switches), (overrides, key) => {
        const kept = score(withIncomeTax({ ...overrides, [key]: true }));
        const left = score(withIncomeTax({ ...overrides, [key]: false }));

        expect(left.result.netFiscalImpact).toBeLessThanOrEqual(kept.result.netFiscalImpact + 1e-9);
        expect(left.result.annualIncomeTaxLost).toBeCloseTo(kept.result.annualIncomeTaxLost, 9);
      }),
      SWEEP
    );
  });

  it("change nothing when the measure is struck down", () => {
    fc.assert(
      fc.property(anyScenario, fc.constantFrom(...switches), (overrides, key) => {
        const params = { ...overrides, litigationSurvivalRate: 0 };
        const kept = score(withIncomeTax({ ...params, [key]: true }));
        const left = score(withIncomeTax({ ...params, [key]: false }));

        expect(left.result.netFiscalImpact).toBeCloseTo(kept.result.netFiscalImpact, 9);
      }),
      SWEEP
    );
  });

  it("score older parameter objects without the new keys as the measure as written", () => {
    const newKeys = [
      "litigationSurvivalRate",
      "collectFromPostSnapshotMovers",
      "includeNonCitizens",
      "incomeTaxDepartureShare",
    ];
    fc.assert(
      fc.property(anyScenario, (overrides) => {
        const explicit = withIncomeTax({
          ...overrides,
          litigationSurvivalRate: 1,
          collectFromPostSnapshotMovers: true,
          includeNonCitizens: true,
          incomeTaxDepartureShare: 0,
        });
        const older = Object.fromEntries(
          Object.entries(explicit).filter(([key]) => !newKeys.includes(key))
        );

        expect(score(older).result.netFiscalImpact).toBe(score(explicit).result.netFiscalImpact);
      }),
      SWEEP
    );
  });

  it("finds the paper snapshot's non-US citizens and leaves all of them out on request", () => {
    const included = score(BASELINE_ASSUMPTIONS);
    const excluded = score({ ...BASELINE_ASSUMPTIONS, includeNonCitizens: false });

    expect(included.micro.nonCitizenCount).toBe(24);
    expect(included.micro.excludedNonCitizenCount).toBe(0);
    expect(excluded.micro.excludedNonCitizenCount).toBe(24);
    // Rows without a citizenship come from the US-citizen backfill.
    expect(included.micro.rows.filter((row) => !row.citizenship).every((row) => !row.nonCitizen)).toBe(true);
  });

  it("splits later departures from what the unannounced response leaves", () => {
    const params = withIncomeTax({
      residencyExclusionIds: ["page"],
      departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
      unannouncedDepartureShare: 0.3,
      incomeTaxDepartureShare: 0.6,
    });
    const { micro, modeledLaterDepartureShare } = score(params);

    expect(micro.laterDeparturePoolIncomeTaxB).toBeCloseTo(micro.remainingResidentIncomeTaxB * 0.7, 9);
    expect(micro.laterDepartureIncomeTaxB).toBeCloseTo(
      modeledLaterDepartureShare * micro.laterDeparturePoolIncomeTaxB,
      9
    );
  });
});

describe("citizenship on snapshots that predate the field", () => {
  it("takes it by name, so the non-citizen switch works on a June 2026 snapshot", () => {
    const juneRows = selectSnapshotRows({
      date: "2026-06-01",
      rows: read("public/snapshots/2026-06-01.json"),
      valuations: null,
      residencyRows: rosterRows,
      metadata,
    });
    expect(juneRows.every((row) => !row.citizenship)).toBe(true);
    const june = (params) =>
      scoreScenario({ params, rows: juneRows, incomeTaxLookup, sourceDate: snapshotSourceDate("2026-06-01") });
    const included = june(BASELINE_ASSUMPTIONS);
    const excluded = june({ ...BASELINE_ASSUMPTIONS, includeNonCitizens: false });
    const bechtolsheim = (scenario) =>
      scenario.micro.rows.find((row) => row.name.startsWith("Andreas von Bechtolsheim"));

    // From the committed table, so daily data cannot move it.
    expect(included.micro.nonCitizenCount).toBe(20);
    expect(bechtolsheim(included).nonCitizen).toBe(true);
    expect(bechtolsheim(included).inBase).toBe(true);
    expect(bechtolsheim(excluded).inBase).toBe(false);
    expect(excluded.micro.grossWealthTaxB).toBeLessThan(included.micro.grossWealthTaxB);
  });
});

describe("the citizenship table", () => {
  const table = read("data/citizenship_by_name.json").byKey;

  it("lets a row's own citizenship win", () => {
    expect(table["andreas von bechtolsheim"]).toBe("Germany");
    expect(citizenshipOf({ name: "Andreas von Bechtolsheim & family", citizenship: "United States" })).toBe(
      "United States"
    );
    expect(citizenshipOf({ name: "Andreas von Bechtolsheim & family" })).toBe("Germany");
    expect(citizenshipOf({ name: "Nobody On Record" })).toBe(null);
  });

  it("has an entry for everyone a stored snapshot records a citizenship for", () => {
    const dates = read("public/snapshots/index.json").filter((date) => date >= "2026-09-17");
    for (const date of dates) {
      for (const row of read(`public/snapshots/${date}.json`)) {
        if (row.citizenship) {
          expect(table[normalizeName(row.name)], `${row.name} on ${date}`).toBeDefined();
        }
      }
    }
  });
});
