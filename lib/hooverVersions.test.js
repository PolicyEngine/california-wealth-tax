/**
 * Invariants behind the paper's account of the Hoover set on the paper
 * snapshot: how the division of the cohort's income tax enters it, and how the
 * chance that the measure survives legal challenge scales it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  INCOME_TAX_METHODS,
} from "./microModel";
import { berkeleyToHooverBridge } from "./bridge";
import { PAPER_SNAPSHOT_DATE, PAPER_SOURCE_DATE } from "./paperNumbers";
import {
  BERKELEY_ASSUMPTIONS,
  HOOVER_ASSUMPTIONS,
  HOOVER_NBER_OCTOBER_2026_ASSUMPTIONS,
} from "./presets";
import { RESIDENCY_ROSTER_DATE } from "./residencyAdjustments";
import { scoreScenario } from "./scenario";
import metadata from "../data/billionaire_metadata.json";
import incomeTaxLookup from "../data/income_tax_lookup.json";
import rosterRows from "../public/snapshots/2026-01-01.json";

const read = (path) =>
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const rows = buildResidencyRosterValuationRows({
  residencyRows: annotateBillionaires({
    billionaires: rosterRows,
    metadata,
    snapshotDate: RESIDENCY_ROSTER_DATE,
  }),
  valuationRows: annotateBillionaires({
    billionaires: read(`public/snapshots/${PAPER_SNAPSHOT_DATE}.json`),
    metadata,
    snapshotDate: PAPER_SNAPSHOT_DATE,
  }),
  rosterValuations: read(`paper/data/roster_valuations_${PAPER_SNAPSHOT_DATE}.json`),
  includeNewEntrants: true,
});
const score = (params) =>
  scoreScenario({ params, rows, incomeTaxLookup, sourceDate: PAPER_SOURCE_DATE });
// Every share on the slider's 1% grid.
const GRID = Array.from({ length: 101 }, (_, index) => index / 100);

describe("the paper's dates and sets", () => {
  it("reads the snapshot at midnight UTC, the clock of the valuation date", () => {
    expect(PAPER_SOURCE_DATE.getTime()).toBe(Date.UTC(2026, 9, 23));
  });

  it("scores the NBER set, the calculator's Hoover starting point", () => {
    expect(HOOVER_ASSUMPTIONS).toBe(HOOVER_NBER_OCTOBER_2026_ASSUMPTIONS);
  });
});

describe("the division of the cohort's income tax under the NBER set", () => {
  const NBER = HOOVER_NBER_OCTOBER_2026_ASSUMPTIONS;
  const byMethod = (method, share) =>
    score({ ...NBER, incomeTaxMethod: method, incomeTaxDepartureShare: share });
  const documentedB = (method) => byMethod(method, 0).micro.knownDepartureIncomeTaxB;
  const byWealthDocumentedB = documentedB(INCOME_TAX_METHODS.WEALTH);
  const fromFilingsDocumentedB = documentedB(INCOME_TAX_METHODS.FILINGS);

  it("moves the net present value only through documented income tax above the target share", () => {
    for (const share of GRID) {
      const wealth = byMethod(INCOME_TAX_METHODS.WEALTH, share);
      const filings = byMethod(INCOME_TAX_METHODS.FILINGS, share);
      const total = wealth.micro.cohortIncomeTaxTotalB;
      const target = share * total;
      // NPV subtracts the income tax lost, so the division that loses less
      // scores higher.
      const expectedGapB =
        (Math.max(byWealthDocumentedB, target) - Math.max(fromFilingsDocumentedB, target)) /
        NBER.discountRate;

      // The cohort's total is the input under either division.
      expect(total, `share ${share}`).toBeCloseTo(NBER.cohortIncomeTaxB, 9);
      expect(filings.micro.cohortIncomeTaxTotalB, `share ${share}`).toBeCloseTo(total, 9);
      // Receipts do not read the division.
      expect(filings.result.pvWealthTaxReceipts).toBe(wealth.result.pvWealthTaxReceipts);
      expect(
        filings.result.netFiscalImpact - wealth.result.netFiscalImpact,
        `share ${share}`
      ).toBeCloseTo(expectedGapB, 6);
    }
  });

  it("is inert at the set's own share, which exceeds what the documented departures carry either way", () => {
    const share = NBER.incomeTaxDepartureShare;

    expect(share * NBER.cohortIncomeTaxB).toBeGreaterThan(
      Math.max(byWealthDocumentedB, fromFilingsDocumentedB)
    );
    expect(byMethod(INCOME_TAX_METHODS.FILINGS, share).result.netFiscalImpact).toBeCloseTo(
      byMethod(INCOME_TAX_METHODS.WEALTH, share).result.netFiscalImpact,
      9
    );
  });
});

describe("the Hoover set's bridge and legal setting", () => {
  const NBER = HOOVER_NBER_OCTOBER_2026_ASSUMPTIONS;

  it("takes the who-pays step entirely from the cohort total", () => {
    const step = (hoover) =>
      berkeleyToHooverBridge(score, hoover).contributions.find(
        ({ id }) => id === "incomeAllocation"
      );

    expect(NBER.incomeTaxMethod).not.toBe(BERKELEY_ASSUMPTIONS.incomeTaxMethod);
    expect(step(NBER).value).toBeLessThan(0);
    // With the two totals equal only the division differs, and at the set's
    // own share it is zero in every ordering, so the bridge drops the step.
    expect(
      step({ ...NBER, cohortIncomeTaxB: BERKELEY_ASSUMPTIONS.cohortIncomeTaxB })
    ).toBeUndefined();
  });

  it("scales receipts, and only receipts, by the survival probability", () => {
    const certain = score({ ...NBER, litigationSurvivalRate: 1 }).result;

    for (const survival of GRID) {
      const scored = score({ ...NBER, litigationSurvivalRate: survival }).result;

      expect(scored.pvWealthTaxReceipts, `survival ${survival}`).toBeCloseTo(
        survival * certain.pvWealthTaxReceipts,
        9
      );
      expect(scored.pvLostIncomeTax, `survival ${survival}`).toBeCloseTo(
        certain.pvLostIncomeTax,
        9
      );
      // So the net present value peaks with survival certain; on the paper
      // snapshot that peak is below zero.
      expect(scored.netFiscalImpact, `survival ${survival}`).toBeLessThanOrEqual(
        certain.netFiscalImpact + 1e-9
      );
    }
    expect(certain.netFiscalImpact).toBeLessThan(0);
  });
});
