/**
 * Invariants behind the paper's comparison of the two Hoover versions on the
 * paper snapshot: how the division of the cohort's income tax enters the NBER
 * set, and what tying the March set's income-tax share to its wealth-tax loss
 * changes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  INCOME_TAX_METHODS,
} from "./microModel";
import {
  marchCoupledAssumptions,
  PAPER_SNAPSHOT_DATE,
  PAPER_SOURCE_DATE,
} from "./paperNumbers";
import {
  HOOVER_ASSUMPTIONS,
  HOOVER_MARCH_2026_ASSUMPTIONS,
  HOOVER_NBER_OCTOBER_2026_ASSUMPTIONS,
} from "./presets";
import {
  postSnapshotMoverNamesFromIds,
  RESIDENCY_ROSTER_DATE,
} from "./residencyAdjustments";
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
    expect(PAPER_SOURCE_DATE.getTime()).toBe(Date.UTC(2026, 8, 18));
  });

  it("keeps the addendum's NBER set as the calculator's Hoover starting point it scores", () => {
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

describe("tying the March set's income-tax share to its wealth-tax loss", () => {
  const asCoded = score(HOOVER_MARCH_2026_ASSUMPTIONS);
  const coupled = score(marchCoupledAssumptions());
  const fourNames = postSnapshotMoverNamesFromIds(
    HOOVER_MARCH_2026_ASSUMPTIONS.residencyExclusionIds
  );
  const fourRows = ({ micro }) => micro.rows.filter((row) => fourNames.includes(row.name));
  const share = ({ micro }) => micro.moverIncomeTaxB / micro.cohortIncomeTaxTotalB;
  const wealthTaxLoss = ({ micro }) =>
    1 - micro.grossWealthTaxB / micro.correctedBaseGrossWealthTaxB;
  // Income tax is divided by net worth and the wealth tax by taxable wealth
  // after the real-estate exclusion and the rate ramp, so shares that should
  // match differ by about 0.1 point on this snapshot.
  const TOLERANCE = 0.002;

  it("unmarks exactly the four later or unconfirmed departures in their Table 7", () => {
    expect([...fourNames].sort()).toEqual([
      "Andy Fang",
      "Jan Koum",
      "Mark Zuckerberg",
      "Reed Hastings",
    ]);
    expect(postSnapshotMoverNamesFromIds(marchCoupledAssumptions().residencyExclusionIds)).toEqual(
      []
    );
    // As coded they stay in the wealth-tax base and their income tax counts as
    // lost; coupled, it counts only through the modeled response.
    expect(fourRows(asCoded)).toHaveLength(4);
    for (const row of fourRows(asCoded)) {
      expect(row.inBase, row.name).toBe(true);
      expect(row.countsTowardKnownIncomeTaxLoss, row.name).toBe(true);
    }
    for (const row of fourRows(coupled)) {
      expect(row.countsTowardKnownIncomeTaxLoss, row.name).toBe(false);
    }
  });

  it("moves only the income-tax side: the elasticity's target is a total share of the base", () => {
    expect(coupled.micro.grossWealthTaxB).toBeCloseTo(asCoded.micro.grossWealthTaxB, 9);
    expect(coupled.result.pvWealthTaxReceipts).toBeCloseTo(asCoded.result.pvWealthTaxReceipts, 9);
    for (const scored of [asCoded, coupled]) {
      expect(scored.micro.cohortIncomeTaxTotalB).toBeCloseTo(
        HOOVER_MARCH_2026_ASSUMPTIONS.cohortIncomeTaxB,
        9
      );
    }
  });

  it("brings the income-tax share to the wealth-tax loss; as coded it exceeds it by the four's income tax", () => {
    const fourIncomeTaxB = fourRows(asCoded).reduce(
      (sum, row) => sum + row.annualIncomeTaxB,
      0
    );
    const excess = share(asCoded) - wealthTaxLoss(asCoded);

    expect(fourIncomeTaxB).toBeGreaterThan(0);
    expect(Math.abs(share(coupled) - wealthTaxLoss(coupled))).toBeLessThan(TOLERANCE);
    expect(
      Math.abs(excess - fourIncomeTaxB / asCoded.micro.cohortIncomeTaxTotalB)
    ).toBeLessThan(TOLERANCE);
  });
});
