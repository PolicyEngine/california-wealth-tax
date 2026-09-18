import { describe, expect, it } from "vitest";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  computeMicroResults,
  FILINGS_INCOME_TAX_B_BY_KEY,
  INCOME_TAX_METHODS,
  normalizeName,
  WEALTH_BASES,
} from "./microModel";
import {
  DEPARTURE_RESPONSE_MODES,
  effectiveAdditionalDepartureShare,
} from "./departureResponse";
import billionaireMetadata from "../data/billionaire_metadata.json";
import liveSnapshot from "../data/billionaires_live.json";
import rosterSnapshot from "../public/snapshots/2026-01-01.json";
import rosterValuations from "../data/roster_valuations.json";
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
    // The all-states list is available and has no valuation for this person,
    // current or stored. Absence says nothing about their worth; they are left
    // out rather than valued.
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

  it("carries someone Forbes dropped at the last value it published", () => {
    const rows = buildResidencyRosterValuationRows({
      residencyRows: [{ name: "Dropped & family", netWorth: 11.4e9 }],
      valuationRows: [],
      rosterValuations: {
        rows: {
          "Dropped & family": { netWorth: 12.0e9, lastListedDate: "2026-06-17" },
        },
      },
    });

    expect(rows[0].valuationSource).toBe("lastListed");
    expect(rows[0].netWorth).toBe(12.0e9);

    const results = computeMicroResults({
      billionaires: rows,
      incomeTaxLookup,
      excludeRealEstate: false,
      incomeYieldRate: 0.02,
    });

    expect(results.wealthTaxBaseRows).toHaveLength(1);
    expect(results.rows[0].lastListedDate).toBe("2026-06-17");
    expect(results.baseNotes.lastListedCount).toBe(1);
    expect(results.baseNotes.lastListedWealthB).toBeCloseTo(12, 6);
  });

  it("leaves people Forbes values below $1 billion out of the base", () => {
    const results = computeMicroResults({
      billionaires: [
        { name: "Still A Billionaire", netWorth: 3e9 },
        { name: "Fell To 400M", netWorth: 0.4e9 },
        { name: "Worth Nothing", netWorth: 0 },
      ],
      incomeTaxLookup,
      excludeRealEstate: false,
      incomeYieldRate: 0.02,
    });

    expect(results.wealthTaxBaseRows.map((row) => row.name)).toEqual([
      "Still A Billionaire",
    ]);
    expect(results.baseNotes.belowThresholdCount).toBe(2);
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

  describe("income-tax allocation", () => {
    const cohort = [
      { name: "Larry Page", netWorth: 280e9 },
      { name: "Sergey Brin", netWorth: 260e9 },
      { name: "Other One", netWorth: 40e9 },
      { name: "Other Two", netWorth: 20e9 },
    ];
    const run = (incomeTaxMethod, extra = {}) =>
      computeMicroResults({
        billionaires: cohort,
        incomeTaxLookup,
        excludeRealEstate: false,
        incomeYieldRate: 0.02,
        incomeTaxMethod,
        cohortIncomeTaxB: 4.5,
        ...extra,
      });
    const tax = (results, name) =>
      results.rows.find((row) => row.name === name).annualIncomeTaxB;

    it("divides the cohort total by wealth under the wealth method", () => {
      const results = run(INCOME_TAX_METHODS.WEALTH);
      const total = results.rows.reduce((sum, row) => sum + row.annualIncomeTaxB, 0);

      expect(total).toBeCloseTo(4.5, 9);
      expect(tax(results, "Larry Page")).toBeCloseTo((4.5 * 280) / 600, 9);
    });

    it("gives filers their filings-based tax and divides the rest by wealth", () => {
      const results = run(INCOME_TAX_METHODS.FILINGS);
      const page = FILINGS_INCOME_TAX_B_BY_KEY.get(normalizeName("Larry Page"));
      const brin = FILINGS_INCOME_TAX_B_BY_KEY.get(normalizeName("Sergey Brin"));
      const total = results.rows.reduce((sum, row) => sum + row.annualIncomeTaxB, 0);

      // 2023-2025 averages from Boll, Saez and Zucman Table 3, $ millions.
      expect(page).toBeCloseTo((0 + 83 + 87) / 3 / 1000, 9);
      expect(brin).toBeCloseTo((0 + 54 + 56) / 3 / 1000, 9);
      expect(tax(results, "Larry Page")).toBeCloseTo(page, 9);
      expect(tax(results, "Other One")).toBeCloseTo(((4.5 - page - brin) * 40) / 60, 9);
      expect(total).toBeCloseTo(4.5, 9);
    });

    it("counts a removed mover's share of the cohort total as the loss", () => {
      const results = run(INCOME_TAX_METHODS.WEALTH, { excludedNames: ["Larry Page"] });

      // Rauh et al.'s f x C: the mover's wealth share of the cohort total.
      expect(results.moverIncomeTaxB).toBeCloseTo((4.5 * 280) / 600, 9);
      expect(results.wealthTaxBaseRows.map((row) => row.name)).not.toContain("Larry Page");
    });

    it("leaves the yield method independent of the cohort total", () => {
      const low = run(INCOME_TAX_METHODS.YIELD, { cohortIncomeTaxB: 1 });
      const high = run(INCOME_TAX_METHODS.YIELD, { cohortIncomeTaxB: 9 });

      expect(tax(low, "Larry Page")).toBeCloseTo(tax(high, "Larry Page"), 9);
      expect(tax(low, "Larry Page")).toBeGreaterThan(0.5);
    });
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
    // 205 people less Trae Stephens, listed at exactly $1.0 billion: with his
    // directly held real estate out of net worth he is under the threshold,
    // and at $1.0 billion the rate ramp gives zero either way.
    expect(results.wealthTaxBaseRows).toHaveLength(204);
    expect(results.postSnapshotDepartureRows).toHaveLength(1);
    expect(results.unconfirmedDepartureRows).toHaveLength(3);
    expect(results.knownDepartureRows).toHaveLength(11);
  });

  describe("modeled further departures", () => {
    const liveRows = buildResidencyRosterValuationRows({
      residencyRows: annotateBillionaires({
        billionaires: rosterSnapshot,
        metadata: billionaireMetadata,
        snapshotDate: "2026-01-01",
      }),
      valuationRows: annotateBillionaires({
        billionaires: liveSnapshot,
        metadata: billionaireMetadata,
        snapshotDate: "live",
      }),
      rosterValuations,
      includeNewEntrants: true,
    });
    const target = 1 - Math.exp(-14.5 * 0.05);

    function deliveredTotalShare(excludedNames) {
      const inputs = {
        billionaires: liveRows,
        incomeTaxLookup,
        excludedNames,
        excludeRealEstate: true,
        incomeYieldRate: 0.02,
      };
      const base = computeMicroResults(inputs);
      const share = effectiveAdditionalDepartureShare({
        mode: DEPARTURE_RESPONSE_MODES.ELASTICITY,
        totalElasticity: 14.5,
        observedLossShare:
          base.observedPreSnapshotDepartureGrossWealthTaxB /
          base.correctedBaseGrossWealthTaxB,
        poolShare: base.unannouncedDeparturePoolShare,
      });
      const scored = computeMicroResults({
        ...inputs,
        unannouncedDepartureShare: share,
      });

      return (
        (scored.observedPreSnapshotDepartureGrossWealthTaxB +
          scored.unannouncedWealthTaxLossB) /
        scored.correctedBaseGrossWealthTaxB
      );
    }

    it("delivers the elasticity's stated total with no documented departures applied", () => {
      // Page, Brin and the rest carry a departure timing in the metadata; with
      // no claim applied they are ordinary members of the base and the modeled
      // response reaches them like anyone else.
      expect(deliveredTotalShare([])).toBeCloseTo(target, 6);
    });

    it("delivers the same total once documented departures are applied", () => {
      expect(
        deliveredTotalShare(["Larry Page", "Sergey Brin", "Peter Thiel"])
      ).toBeCloseTo(target, 6);
    });

    it("takes the modeled share from a reported post-January 1 mover only until that claim is applied", () => {
      const score = (postSnapshotMoverNames) =>
        computeMicroResults({
          billionaires: liveRows,
          incomeTaxLookup,
          postSnapshotMoverNames,
          excludeRealEstate: true,
          incomeYieldRate: 0.02,
        }).rows.find((row) => row.name === "Mark Zuckerberg");

      // With no claim applied he is an ordinary member of the base.
      expect(score([]).inBase).toBe(true);
      expect(score([]).eligibleForUnannouncedDeparture).toBe(true);
      // Applying the claim says he was a resident on January 1: he owes the
      // tax, loses his income tax, and cannot be an unannounced departure.
      const applied = score(["Mark Zuckerberg"]);
      expect(applied.inBase).toBe(true);
      expect(applied.countsTowardKnownIncomeTaxLoss).toBe(true);
      expect(applied.eligibleForUnannouncedDeparture).toBe(false);
    });
  });
});
