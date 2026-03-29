import { describe, expect, it } from "vitest";
import {
  annotateBillionaires,
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

  it("matches the paper-aligned corrected base and departure timing buckets", () => {
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

    expect(results.rawForbesRows).toHaveLength(214);
    expect(results.correctedBaseRows).toHaveLength(212);
    expect(results.wealthTaxBaseRows).toHaveLength(206);
    expect(results.preSnapshotDepartureRows).toHaveLength(6);
    expect(results.postSnapshotDepartureRows).toHaveLength(1);
    expect(results.unconfirmedDepartureRows).toHaveLength(3);
    expect(results.knownDepartureRows).toHaveLength(10);
  });
});
