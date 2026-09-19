// Regenerate paper/paper_numbers.json:  bun scripts/paper_numbers.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { computePaperNumbers, PAPER_SNAPSHOT_DATE } from "../lib/paperNumbers.js";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const numbers = computePaperNumbers({
  rosterRows: read("public/snapshots/2026-01-01.json"),
  snapshotRows: read(`public/snapshots/${PAPER_SNAPSHOT_DATE}.json`),
  rosterValuations: read(`paper/data/roster_valuations_${PAPER_SNAPSHOT_DATE}.json`),
  metadata: read("data/billionaire_metadata.json"),
  incomeTaxLookup: read("data/income_tax_lookup.json"),
});

writeFileSync(
  new URL("../paper/paper_numbers.json", import.meta.url),
  `${JSON.stringify(numbers, null, 2)}\n`
);
console.log(numbers);
