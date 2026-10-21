/**
 * Invariants behind the paper's comparison of the two Hoover versions on the
 * paper snapshot: how the division of the cohort's income tax enters the NBER
 * set, and what tying the March set's income-tax share to its wealth-tax loss
 * changes.
 */
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  INCOME_TAX_METHODS,
} from "./microModel";
import { PAPER_SNAPSHOT_DATE } from "./paperNumbers";
import { HOOVER_ASSUMPTIONS, HOOVER_MARCH_2026_ASSUMPTIONS } from "./presets";
import { POST_SNAPSHOT_MOVER_IDS } from "./residencyAdjustments";
import { scoreScenario } from "./scenario";
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
const sourceDate = new Date(`${PAPER_SNAPSHOT_DATE}T00:00:00`);
const score = (params) => scoreScenario({ params, rows, incomeTaxLookup, sourceDate });
// Shares on the slider's 1% grid.
const gridShare = fc.integer({ min: 0, max: 100 }).map((x) => x / 100);

describe("the division of the cohort's income tax under the NBER set", () => {
  const byMethod = (method, share) =>
    score({ ...HOOVER_ASSUMPTIONS, incomeTaxMethod: method, incomeTaxDepartureShare: share });
  const documented = (method) => {
    const { micro } = byMethod(method, 0);
    return micro.knownDepartureIncomeTaxB;
  };
  const byWealthDocumentedB = documented(INCOME_TAX_METHODS.WEALTH);
  const fromFilingsDocumentedB = documented(INCOME_TAX_METHODS.FILINGS);

  it("moves the net present value only through documented income tax above the target share", () => {
    fc.assert(
      fc.property(gridShare, (share) => {
        const wealth = byMethod(INCOME_TAX_METHODS.WEALTH, share);
        const filings = byMethod(INCOME_TAX_METHODS.FILINGS, share);
        const total = wealth.micro.cohortIncomeTaxTotalB;
        const target = share * total;
        // NPV subtracts the income tax lost, so the division that loses less
        // scores higher.
        const expectedGapB =
          (Math.max(byWealthDocumentedB, target) - Math.max(fromFilingsDocumentedB, target)) /
          HOOVER_ASSUMPTIONS.discountRate;

        expect(filings.micro.cohortIncomeTaxTotalB).toBeCloseTo(total, 9);
        // Receipts do not read the division.
        expect(filings.result.pvWealthTaxReceipts).toBe(wealth.result.pvWealthTaxReceipts);
        expect(filings.result.netFiscalImpact - wealth.result.netFiscalImpact).toBeCloseTo(
          expectedGapB,
          6
        );
      }),
      { numRuns: 60 }
    );
  });

  it("is inert at the set's own share, which exceeds what the documented departures carry either way", () => {
    const total = score(HOOVER_ASSUMPTIONS).micro.cohortIncomeTaxTotalB;
    const share = HOOVER_ASSUMPTIONS.incomeTaxDepartureShare;

    expect(share * total).toBeGreaterThan(Math.max(byWealthDocumentedB, fromFilingsDocumentedB));
    expect(byMethod(INCOME_TAX_METHODS.FILINGS, share).result.netFiscalImpact).toBeCloseTo(
      byMethod(INCOME_TAX_METHODS.WEALTH, share).result.netFiscalImpact,
      9
    );
  });
});

describe("tying the March set's income-tax share to its wealth-tax loss", () => {
  const asCoded = score(HOOVER_MARCH_2026_ASSUMPTIONS);
  const coupled = score({
    ...HOOVER_MARCH_2026_ASSUMPTIONS,
    residencyExclusionIds: HOOVER_MARCH_2026_ASSUMPTIONS.residencyExclusionIds.filter(
      (id) => !POST_SNAPSHOT_MOVER_IDS.includes(id)
    ),
  });
  const share = ({ micro }) => micro.moverIncomeTaxB / micro.cohortIncomeTaxTotalB;
  const wealthTaxLoss = ({ micro }) => 1 - micro.grossWealthTaxB / micro.correctedBaseGrossWealthTaxB;

  it("moves only the income-tax side: the elasticity's target is a total share of the base", () => {
    expect(coupled.micro.grossWealthTaxB).toBeCloseTo(asCoded.micro.grossWealthTaxB, 9);
    expect(coupled.result.pvWealthTaxReceipts).toBeCloseTo(asCoded.result.pvWealthTaxReceipts, 9);
    expect(coupled.micro.postSnapshotDepartureRows).toHaveLength(0);
    expect(coupled.result.pvLostIncomeTax).toBeLessThan(asCoded.result.pvLostIncomeTax);
  });

  it("brings the income-tax share to the wealth-tax loss, which the coded set exceeds", () => {
    // Not an identity: income tax is divided by net worth, the wealth tax by
    // taxable wealth after the real-estate exclusion and the rate ramp.
    expect(Math.abs(share(coupled) - wealthTaxLoss(coupled))).toBeLessThan(0.01);
    expect(share(asCoded) - wealthTaxLoss(asCoded)).toBeGreaterThan(0.05);
  });
});
