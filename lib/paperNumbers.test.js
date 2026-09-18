import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  computePaperNumbers,
  longDate,
  manuscriptStrings,
  PAPER_SNAPSHOT_DATE,
} from "./paperNumbers";
import committed from "../paper/paper_numbers.json";
import incomeTaxLookup from "../data/income_tax_lookup.json";
import metadata from "../data/billionaire_metadata.json";
import rosterRows from "../public/snapshots/2026-01-01.json";
import rosterValuations from "../paper/data/roster_valuations_2026-09-18.json";
import snapshotRows from "../public/snapshots/2026-09-18.json";

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

  it("date every figure to the paper snapshot", () => {
    expect(paper).toContain(`All figures use the Forbes snapshot for ${longDate(PAPER_SNAPSHOT_DATE)}`);
    expect(paper).toContain(`date: "${longDate(PAPER_SNAPSHOT_DATE)}"`);
  });
});
