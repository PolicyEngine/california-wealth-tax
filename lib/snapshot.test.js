import { describe, expect, it } from "vitest";
import { loadSnapshot, snapshotReducer, selectSnapshotRows } from "./snapshot";
import { annotateBillionaires, computeMicroResults } from "./microModel";
import metadata from "../data/billionaire_metadata.json";
import rauhData from "../data/billionaires_rauh.json";
import residencyRows from "../public/snapshots/2026-01-01.json";

describe("selected snapshot population", () => {
  it("uses the actual October roster rather than a January/October hybrid", () => {
    const rows = selectSnapshotRows({ date: "2025-10-17", rows: rauhData, residencyRows, metadata });
    const expected = annotateBillionaires({ billionaires: rauhData, metadata, snapshotDate: "2025-10-17" });
    expect(rows).toEqual(expected);
    expect(rows.some((row) => row.name === "Oprah Winfrey")).toBe(true);
    expect(rows.some((row) => row.name === "Charles Schwab")).toBe(false);
    const score = computeMicroResults({ billionaires: rows, excludedNames: [], excludeRealEstate: true, incomeYieldRate: 0.02 });
    expect(score.wealthTaxBaseRows.some((row) => row.name === "Larry Ellison")).toBe(false);
    // Independent review reproduction: $94.665B on the actual October roster.
    expect(score.grossWealthTaxB).toBeCloseTo(94.665, 3);
  });
  it("uses pre-January historical membership without adding January-only people", () => {
    expect(selectSnapshotRows({ date: "2025-12-15", rows: [{ name: "Historical", netWorth: 2e9 }], residencyRows, metadata })).toHaveLength(1);
  });
});

describe("atomic snapshot loading", () => {
  const initial = { date: "2026-09-19", rows: [{ name: "Live" }], valuations: null, status: "ready", requestedDate: "2026-09-19", errorDate: null };
  it("retains the prior date and rows while pending, then commits an older snapshot without optional valuations", async () => {
    let state = snapshotReducer(initial, { type: "start", date: "2026-03-30" });
    expect(state).toMatchObject({ date: initial.date, rows: initial.rows, status: "loading" });
    const rows = [{ name: "Historical" }];
    const loaded = await loadSnapshot({ date: "2026-03-30", loadJson: async (path) => {
      if (path.startsWith("roster_valuations")) throw Object.assign(new Error("missing"), { status: 404 });
      return rows;
    } });
    state = snapshotReducer(state, { type: "success", snapshot: loaded });
    expect(state).toMatchObject({ date: "2026-03-30", rows, valuations: null, status: "ready" });
  });
  it("ignores a canceled/stale success or failure, and keeps the last good date on failure", () => {
    let state = snapshotReducer(initial, { type: "start", date: "2026-03-30" });
    state = snapshotReducer(state, { type: "start", date: "2026-03-31" });
    expect(snapshotReducer(state, { type: "success", snapshot: { date: "2026-03-30", rows: [] } })).toBe(state);
    expect(snapshotReducer(state, { type: "failure", date: "2026-03-30" })).toBe(state);
    state = snapshotReducer(state, { type: "failure", date: "2026-03-31" });
    expect(state).toMatchObject({ date: initial.date, rows: initial.rows, status: "error", errorDate: "2026-03-31" });
    expect(snapshotReducer(state, { type: "start", date: "2026-04-01" }).errorDate).toBeNull();
  });
  it("does not hide required snapshot or unexpected optional request failures", async () => {
    await expect(loadSnapshot({ date: "2026-03-30", loadJson: async () => { throw new Error("network"); } })).rejects.toThrow("network");
  });
});
