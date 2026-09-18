import { describe, expect, it } from "vitest";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  computeMicroResults,
  FTB_AGGREGATE_INCOME_TAX_RANGE_B,
  INCOME_TAX_MODES,
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

  it("keeps wealth-tax exclusions separate from income-tax mover status", () => {
    const results = computeMicroResults({
      billionaires: [
        {
          name: "Departed but liable",
          netWorth: 2e9,
          realEstate: 0,
          includeInRawForbes: true,
          departureTiming: "pre_snapshot",
        },
        {
          name: "Excluded but not counted for income tax",
          netWorth: 3e9,
          realEstate: 0,
          includeInRawForbes: true,
          departureTiming: "pre_snapshot",
        },
      ],
      incomeTaxLookup,
      excludedNames: ["Excluded but not counted for income tax"],
      incomeTaxMoverNames: ["Departed but liable"],
      excludeRealEstate: false,
      incomeYieldRate: 0.02,
      sourceDate: new Date("2025-10-17T00:00:00"),
    });

    expect(
      results.wealthTaxBaseRows.map((row) => row.name)
    ).toEqual(["Departed but liable"]);
    expect(results.knownDepartureRows.map((row) => row.name)).toEqual([
      "Departed but liable",
    ]);
  });

  const FTB_TOY_BILLIONAIRES = [
    {
      name: "Stayer",
      netWorth: 6e9,
      realEstate: 0,
      includeInRawForbes: true,
    },
    {
      name: "Mover",
      netWorth: 3e9,
      realEstate: 0,
      includeInRawForbes: true,
      departureTiming: "unconfirmed",
    },
    {
      name: "Outside roster",
      netWorth: 1e9,
      realEstate: 0,
      includeInRawForbes: false,
    },
  ];

  it("allocates the FTB aggregate income tax by wealth share", () => {
    const results = computeMicroResults({
      billionaires: FTB_TOY_BILLIONAIRES,
      incomeTaxLookup,
      excludedNames: [],
      incomeTaxMoverNames: ["Mover"],
      excludeRealEstate: false,
      incomeYieldRate: 0.03,
      incomeTaxMode: INCOME_TAX_MODES.FTB_AGGREGATE,
      aggregateAnnualIncomeTaxB: 4.5,
      sourceDate: new Date("2025-10-17T00:00:00"),
    });

    const byName = Object.fromEntries(
      results.rows.map((row) => [row.name, row])
    );

    // Universe wealth = 6 + 3 = 9; allocation is proportional to net worth.
    expect(byName["Stayer"].annualIncomeTaxB).toBeCloseTo(3, 6);
    expect(byName["Mover"].annualIncomeTaxB).toBeCloseTo(1.5, 6);
    expect(byName["Outside roster"].annualIncomeTaxB).toBe(0);
    // Mover loss = aggregate × mover wealth share, Rauh's f·C structure.
    expect(results.knownDepartureIncomeTaxB).toBeCloseTo(1.5, 6);
    expect(results.incomeTaxUniverseAnnualIncomeTaxB).toBeCloseTo(4.5, 6);
    expect(results.incomeTaxUniverseWealthB).toBeCloseTo(9, 6);
  });

  it("applies the unannounced departure share to allocated income tax", () => {
    const results = computeMicroResults({
      billionaires: FTB_TOY_BILLIONAIRES,
      incomeTaxLookup,
      excludedNames: [],
      incomeTaxMoverNames: ["Mover"],
      excludeRealEstate: false,
      incomeYieldRate: 0.03,
      incomeTaxMode: INCOME_TAX_MODES.FTB_AGGREGATE,
      aggregateAnnualIncomeTaxB: 4.5,
      unannouncedDepartureShare: 0.5,
      sourceDate: new Date("2025-10-17T00:00:00"),
    });

    // The stayer's allocated $3B/yr loses half to unannounced departures.
    expect(results.unannouncedIncomeTaxB).toBeCloseTo(1.5, 6);
    expect(results.moverIncomeTaxB).toBeCloseTo(3, 6);
  });

  it("defaults to the yield method and keeps it unchanged", () => {
    const common = {
      billionaires: FTB_TOY_BILLIONAIRES,
      incomeTaxLookup,
      excludedNames: [],
      incomeTaxMoverNames: ["Mover"],
      excludeRealEstate: false,
      incomeYieldRate: 0.03,
      sourceDate: new Date("2025-10-17T00:00:00"),
    };
    const implicitDefault = computeMicroResults(common);
    const explicitYield = computeMicroResults({
      ...common,
      incomeTaxMode: INCOME_TAX_MODES.YIELD,
      aggregateAnnualIncomeTaxB: FTB_AGGREGATE_INCOME_TAX_RANGE_B.midpoint,
    });

    expect(explicitYield.moverIncomeTaxB).toBeCloseTo(
      implicitDefault.moverIncomeTaxB,
      9
    );
    expect(implicitDefault.moverIncomeTaxB).toBeGreaterThan(0);
    expect(implicitDefault.incomeTaxUniverseAnnualIncomeTaxB).toBeGreaterThan(
      0
    );
  });
});
