import { describe, expect, it } from "vitest";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  computeMicroResults,
  WEALTH_BASES,
} from "./microModel";
import billionaireMetadata from "../data/billionaire_metadata.json";
import incomeTaxLookup from "../data/income_tax_lookup.json";
import rauhData from "../data/billionaires_rauh.json";

describe("annotateBillionaires", () => {
  it("adds synthetic paper corrections to the 2025-10-17 snapshot", () => {
    const rows = annotateBillionaires({
      billionaires: rauhData,
      metadata: billionaireMetadata,
      snapshotDate: "2025-10-17",
    });

    const davidSacks = rows.find((row) => row.name === "David Sacks");
    const andyFang = rows.find((row) => row.name === "Andy Fang");
    expect(davidSacks).toMatchObject({
      includeInRawForbes: false,
      departureTiming: "pre_snapshot",
    });
    expect(andyFang).toMatchObject({
      departureTiming: "unconfirmed",
    });
  });
});

describe("computeMicroResults", () => {
  it("can use a fixed residency roster with a separate valuation snapshot", () => {
    const results = computeMicroResults({
      billionaires: buildResidencyRosterValuationRows({
        residencyRows: [
          {
            name: "Resident A",
            netWorth: 2e9,
            realEstate: 0,
            includeInRawForbes: true,
            departureTiming: null,
          },
          {
            name: "Resident B",
            netWorth: 3e9,
            realEstate: 0,
            includeInRawForbes: true,
            departureTiming: "pre_snapshot",
          },
        ],
        valuationRows: [
          {
            name: "Resident A",
            netWorth: 5e9,
            realEstate: 0,
            includeInRawForbes: true,
            departureTiming: null,
          },
        ],
      }),
      incomeTaxLookup,
      excludedNames: ["Resident B"],
      excludeRealEstate: false,
      incomeYieldRate: 0,
      sourceDate: new Date("2025-10-17T00:00:00"),
    });

    expect(results.rows.find((row) => row.name === "Resident A")?.netWorthB).toBeCloseTo(5, 6);
    expect(results.rows.find((row) => row.name === "Resident B")?.netWorthB).toBeCloseTo(3, 6);
    expect(results.grossWealthTaxB).toBeCloseTo(
      results.rows.find((row) => row.name === "Resident A")?.grossTaxB ?? 0,
      6
    );
    expect(results.observedPreSnapshotDepartureRows).toHaveLength(1);
  });

  it("joins the roster on a normalized name and never freezes a renamed person", () => {
    const rows = buildResidencyRosterValuationRows({
      residencyRows: [
        { name: "Ken Xie", netWorth: 5.64e9 },
        { name: "Archie Aldis Emmerson & family", netWorth: 5.62e9 },
      ],
      valuationRows: [
        { name: "Ken Xie & family", netWorth: 11.55e9 },
        { name: "Archie Aldis Emmerson", netWorth: 6.1e9 },
      ],
    });

    expect(rows.map((row) => row.netWorth)).toEqual([11.55e9, 6.1e9]);
    expect(rows.every((row) => row.valuationFallback === false)).toBe(true);
    expect(rows.every((row) => row.valuationSource === "californiaList")).toBe(true);
  });

  it("values roster members Forbes moved out of California at their current worth", () => {
    const rows = buildResidencyRosterValuationRows({
      residencyRows: [
        { name: "Moved Away", netWorth: 8.67e9 },
        { name: "Off The List", netWorth: 1.2e9 },
      ],
      valuationRows: [],
      rosterValuations: {
        rows: {
          "Moved Away": { netWorth: 7.27e9, forbesState: "Tennessee" },
        },
      },
    });

    expect(rows[0].netWorth).toBe(7.27e9);
    expect(rows[0].forbesState).toBe("Tennessee");
    expect(rows[0].valuationSource).toBe("anyStateList");
    expect(rows[0].valuationFallback).toBe(false);
    // The all-states list is available and does not carry this person:
    // Forbes lists $1 billion and up, so they are below the threshold.
    expect(rows[1].netWorth).toBe(0);
    expect(rows[1].rosterNetWorth).toBe(1.2e9);
    expect(rows[1].valuationSource).toBe("offForbesList");

    const results = computeMicroResults({
      billionaires: rows,
      incomeTaxLookup,
      excludeRealEstate: false,
      incomeYieldRate: 0.02,
    });

    expect(results.wealthTaxBaseRows.map((row) => row.name)).toEqual([
      "Moved Away",
    ]);
    expect(results.baseNotes.anyStateValuedCount).toBe(1);
    expect(results.baseNotes.offForbesListCount).toBe(1);
    expect(results.baseNotes.offForbesListRosterWealthB).toBeCloseTo(1.2, 6);
  });

  it("freezes unmatched roster members only when no all-states list exists", () => {
    const rows = buildResidencyRosterValuationRows({
      residencyRows: [{ name: "Unmatched", netWorth: 1.2e9 }],
      valuationRows: [],
    });

    expect(rows[0].netWorth).toBe(1.2e9);
    expect(rows[0].valuationSource).toBe("frozenRoster");
    expect(rows[0].valuationFallback).toBe(true);
  });

  it("adds people who became billionaires after the roster date only when asked", () => {
    const residencyRows = [{ name: "Roster Member", netWorth: 2e9 }];
    const valuationRows = [
      { name: "Roster Member", netWorth: 2.5e9 },
      { name: "New Billionaire", netWorth: 15.5e9 },
      { name: "Tracked Departure", netWorth: 2e9, includeInRawForbes: false },
    ];

    expect(
      buildResidencyRosterValuationRows({ residencyRows, valuationRows })
    ).toHaveLength(1);

    const rows = buildResidencyRosterValuationRows({
      residencyRows,
      valuationRows,
      includeNewEntrants: true,
    });

    expect(rows.map((row) => row.name)).toEqual([
      "Roster Member",
      "New Billionaire",
    ]);
    expect(rows[1].residencyAssumed).toBe(true);

    const results = computeMicroResults({
      billionaires: rows,
      incomeTaxLookup,
      excludeRealEstate: false,
      incomeYieldRate: 0.02,
    });

    expect(results.baseNotes.assumedResidencyCount).toBe(1);
    expect(results.baseNotes.assumedResidencyWealthB).toBeCloseTo(15.5, 6);
  });

  it("excludes a named person even when Forbes renames them", () => {
    const results = computeMicroResults({
      billionaires: [{ name: "Ken Xie & family", netWorth: 11.55e9 }],
      incomeTaxLookup,
      excludedNames: ["Ken Xie"],
      excludeRealEstate: false,
      incomeYieldRate: 0.02,
    });

    expect(results.wealthTaxBaseRows).toHaveLength(0);
  });

  it("applies negative wealth growth to the valuation date", () => {
    const results = computeMicroResults({
      billionaires: [{ name: "Example", netWorth: 10e9, realEstate: 0 }],
      incomeTaxLookup,
      excludeRealEstate: false,
      incomeYieldRate: 0.02,
      wealthGrowthRate: -0.2,
      sourceDate: new Date("2025-12-31T00:00:00"),
    });

    expect(results.rows[0].netWorthB).toBeCloseTo(8, 1);
  });

  it("uses net worth excluding directly held real estate for the phase-in", () => {
    const results = computeMicroResults({
      billionaires: [
        {
          name: "Test Billionaire",
          netWorth: 1.05e9,
          realEstate: 0.1e9,
          includeInRawForbes: true,
        },
      ],
      incomeTaxLookup,
      wealthBase: WEALTH_BASES.ALL_FORBES,
      excludeRealEstate: true,
      incomeYieldRate: 0,
      sourceDate: new Date("2025-10-17T00:00:00"),
    });

    expect(results.rows[0].taxableWealthB).toBeCloseTo(0.95, 6);
    expect(results.rows[0].rate).toBe(0);
    expect(results.grossWealthTaxB).toBe(0);
  });

  it("imputes missing real estate at 0.64% of net worth", () => {
    const results = computeMicroResults({
      billionaires: [
        {
          name: "New Billionaire",
          netWorth: 2e9,
          realEstate: 0,
          includeInRawForbes: true,
        },
      ],
      incomeTaxLookup,
      wealthBase: WEALTH_BASES.ALL_FORBES,
      excludeRealEstate: true,
      incomeYieldRate: 0,
      sourceDate: new Date("2025-10-17T00:00:00"),
    });

    expect(results.rows[0].realEstateB).toBeCloseTo(0.0128, 6);
    expect(results.rows[0].realEstateImputed).toBe(true);
    expect(results.rows[0].taxableWealthB).toBeCloseTo(1.9872, 6);
  });

  it("keeps known zero real estate holdings at zero", () => {
    const results = computeMicroResults({
      billionaires: [
        {
          name: "Adam Foroughi",
          netWorth: 2e9,
          realEstate: 0,
          includeInRawForbes: true,
        },
      ],
      incomeTaxLookup,
      wealthBase: WEALTH_BASES.ALL_FORBES,
      excludeRealEstate: true,
      incomeYieldRate: 0,
      sourceDate: new Date("2025-10-17T00:00:00"),
    });

    expect(results.rows[0].realEstateB).toBe(0);
    expect(results.rows[0].realEstateImputed).toBe(false);
    expect(results.rows[0].taxableWealthB).toBeCloseTo(2, 6);
  });

  it("matches the documented corrected base and departure timing buckets", () => {
    const results = computeMicroResults({
      billionaires: annotateBillionaires({
        billionaires: rauhData,
        metadata: billionaireMetadata,
        snapshotDate: "2025-10-17",
      }),
      incomeTaxLookup,
      wealthBase: WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES,
      excludeRealEstate: true,
      incomeYieldRate: 0.042,
      sourceDate: new Date("2025-10-17T00:00:00"),
    });

    // 214 Forbes rows less Larry Ellison, whom Forbes lists in Florida and
    // every published estimate now excludes from every base.
    expect(results.rawForbesRows).toHaveLength(213);
    // Rauh et al.'s 212: also drops Houston and Snyder, adds David Sacks.
    expect(results.correctedBaseRows).toHaveLength(212);
    // Rauh et al. Table 6's six reported pre-January 1 departures plus Travis
    // Kalanick, who said on the record that he moved on December 18, 2025.
    expect(results.preSnapshotDepartureRows).toHaveLength(7);
    expect(results.wealthTaxBaseRows).toHaveLength(205);
    expect(results.postSnapshotDepartureRows).toHaveLength(1);
    expect(results.unconfirmedDepartureRows).toHaveLength(3);
    expect(results.knownDepartureRows).toHaveLength(11);
  });
});
