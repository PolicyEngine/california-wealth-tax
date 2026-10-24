import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  computeMicroResults,
  INCOME_TAX_METHODS,
  normalizeName,
} from "./microModel";
import {
  computePaperNumbers,
  longDate,
  manuscriptStrings,
  PAPER_SNAPSHOT_DATE,
  PAPER_SOURCE_DATE,
  PAPER_STAGE_TWO_ASSUMPTIONS,
} from "./paperNumbers";
import { HOOVER_ASSUMPTIONS } from "./presets";
import { RESIDENCY_ROSTER_DATE } from "./residencyAdjustments";
import { scoreScenario } from "./scenario";
import committed from "../paper/paper_numbers.json";
import incomeTaxLookup from "../data/income_tax_lookup.json";
import metadata from "../data/billionaire_metadata.json";
import rosterRows from "../public/snapshots/2026-01-01.json";
import rosterValuations from "../paper/data/roster_valuations_2026-10-23.json";
import snapshotRows from "../public/snapshots/2026-10-23.json";

const paper = readFileSync(
  new URL("../paper/california-wealth-tax-ssrn-draft.qmd", import.meta.url),
  "utf8"
).replace(/\s+/g, " ");

describe("paper numbers", () => {
  const numbers = computePaperNumbers({
    rosterRows,
    snapshotRows,
    rosterValuations,
    metadata,
    incomeTaxLookup,
  });

  it("match the committed paper_numbers.json (rerun scripts/paper_numbers.mjs)", () => {
    expect(numbers).toEqual(committed);
    expect(numbers.snapshotDate).toBe(PAPER_SNAPSHOT_DATE);
  });

  it("appear in the manuscript exactly as computed", () => {
    for (const [field, text] of Object.entries(manuscriptStrings(numbers))) {
      expect(paper, `manuscript should contain "${text}" (${field})`).toContain(
        text
      );
    }
  });

  it("are each quoted somewhere in the manuscript", () => {
    // A field nobody quotes is a number nobody checks: drop it or use it.
    const quoted = Object.keys(manuscriptStrings(numbers)).sort();
    const computed = Object.keys(numbers)
      .filter((key) => key !== "snapshotDate")
      .sort();
    expect(quoted).toEqual(computed);
  });

  // Rebuilt from the snapshots here, so a figure taken from the wrong rows
  // fails on its own and not only against the committed JSON.
  const rows = buildResidencyRosterValuationRows({
    residencyRows: annotateBillionaires({
      billionaires: rosterRows,
      metadata,
      snapshotDate: RESIDENCY_ROSTER_DATE,
    }),
    valuationRows: annotateBillionaires({
      billionaires: snapshotRows,
      metadata,
      snapshotDate: PAPER_SNAPSHOT_DATE,
    }),
    rosterValuations,
    includeNewEntrants: true,
  });

  it("count everyone the join adds, less only the entrants under $1 billion", () => {
    const rosterKeys = new Set(rosterRows.map((row) => normalizeName(row.name)));
    const notOnRoster = snapshotRows.filter(
      (row) => !rosterKeys.has(normalizeName(row.name))
    );
    expect(numbers.newEntrantAddedPeople).toBe(notOnRoster.length);
    expect(numbers.newEntrantAddedWealthB).toBe(
      Math.round(notOnRoster.reduce((sum, row) => sum + row.netWorth, 0) / 1e9)
    );

    const baseline = computeMicroResults({
      billionaires: rows,
      incomeTaxLookup,
      excludedNames: [],
      excludeRealEstate: true,
      incomeYieldRate: PAPER_STAGE_TWO_ASSUMPTIONS.incomeYieldRate,
      sourceDate: PAPER_SOURCE_DATE,
    });
    const entrantsUnderThreshold = baseline.rawForbesRows.filter(
      (row) => row.residencyAssumed && row.belowThreshold
    );
    expect(entrantsUnderThreshold.length).toBeGreaterThan(0);
    expect(numbers.newEntrantAddedPeople - numbers.newEntrantPeople).toBe(
      entrantsUnderThreshold.length
    );
  });

  it("round the four largest fortunes' totals once, from unrounded values", () => {
    const micro = (params) =>
      scoreScenario({ params, rows, incomeTaxLookup, sourceDate: PAPER_SOURCE_DATE }).micro;
    const byWealth = micro(HOOVER_ASSUMPTIONS);
    const fromFilings = micro({
      ...HOOVER_ASSUMPTIONS,
      incomeTaxMethod: INCOME_TAX_METHODS.FILINGS,
    });
    const names = numbers.fourLargest.map((person) => person.name);
    const total = (scored, value) =>
      names.reduce(
        (sum, name) => sum + value(scored.rows.find((row) => row.name === name)),
        0
      );
    const cohortWealthB = byWealth.rows
      .filter((row) => row.inIncomeTaxCohort)
      .reduce((sum, row) => sum + row.netWorthB, 0);

    expect(numbers.fourLargestWealthSharePct).toBe(
      Number(((100 * total(byWealth, (row) => row.netWorthB)) / cohortWealthB).toFixed(1))
    );
    expect(numbers.fourLargestByWealthM).toBe(
      Math.round(total(byWealth, (row) => row.annualIncomeTaxB) * 1000)
    );
    expect(numbers.fourLargestFromFilingsM).toBe(
      Math.round(total(fromFilings, (row) => row.annualIncomeTaxB) * 1000)
    );
  });

  it("date every figure to the paper snapshot", () => {
    expect(paper).toContain(`All figures use the Forbes snapshot for ${longDate(PAPER_SNAPSHOT_DATE)}`);
    expect(paper).toContain(`date: "${longDate(PAPER_SNAPSHOT_DATE)}"`);
  });
});
