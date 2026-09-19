import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  INCOME_TAX_METHODS,
} from "./microModel";
import { DEPARTURE_RESPONSE_MODES } from "./departureResponse";
import { BASELINE_ASSUMPTIONS, HOOVER_ASSUMPTIONS } from "./presets";
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
const sourceDate = new Date(`${PAPER_SNAPSHOT_DATE}T00:00:00`);
const npv = (params) =>
  scoreScenario({ params, rows, incomeTaxLookup, sourceDate }).result.netFiscalImpact;

describe("scoreScenario", () => {
  it("is bilinear in the unannounced share and the cohort total, so four corners give the heatmap", () => {
    for (const base of [BASELINE_ASSUMPTIONS, HOOVER_ASSUMPTIONS]) {
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
});
