import { describe, expect, it } from "vitest";
import {
  buildScenarioHref,
  parseScenarioParams,
  serializeScenarioParams,
} from "./scenarioUrl";
import { WEALTH_TAX_PAYMENT_MODES } from "./calculator";
import { WEALTH_BASES } from "./microModel";
import { DEPARTURE_RESPONSE_MODES } from "./departureResponse";
import {
  RAUH_PRE_SNAPSHOT_EXCLUSION_IDS,
  RESIDENCY_ONLY_EXCLUSION_IDS,
} from "./residencyAdjustments";

const RAUH_EXCLUSIONS = [
  ...RESIDENCY_ONLY_EXCLUSION_IDS,
  ...RAUH_PRE_SNAPSHOT_EXCLUSION_IDS,
];

const DEFAULT_PARAMS = {
  snapshotDate: "2026-03-27",
  residencyExclusionIds: [],
  departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
  wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
  excludeRealEstate: false,
  includeIncomeTaxEffects: false,
  wealthGrowthRate: 0,
  incomeGrowthRate: 0,
  avoidanceRate: 0.1,
  unannouncedDepartureShare: 0,
  migrationSemiElasticity: 12,
  annualReturnRate: 0,
  incomeYieldRate: 0.01,
  incomeTaxAttributionRate: 1,
  horizonYears: Infinity,
  discountRate: 0.03,
};

describe("scenarioUrl helpers", () => {
  it("parses scenario params from URL search params", () => {
    const params = parseScenarioParams(
      new URLSearchParams(
        `date=2025-10-17&base=${WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES}&departures=${DEPARTURE_RESPONSE_MODES.ELASTICITY}&exre=1&pit=1&avoidance=0.15&elasticity=10.3&annual_return=0.05&yield=0.036&attrib=0.6&horizon=inf&discount=0.03`
      ),
      DEFAULT_PARAMS
    );

    expect(params).toEqual({
      snapshotDate: "2025-10-17",
      residencyExclusionIds: RAUH_EXCLUSIONS,
      departureResponseMode: DEPARTURE_RESPONSE_MODES.ELASTICITY,
      wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
      excludeRealEstate: true,
      includeIncomeTaxEffects: true,
      wealthGrowthRate: 0,
      incomeGrowthRate: 0,
      avoidanceRate: 0.15,
      unannouncedDepartureShare: 0,
      migrationSemiElasticity: 10.3,
      annualReturnRate: 0.05,
      incomeYieldRate: 0.036,
      incomeTaxAttributionRate: 0.6,
      horizonYears: Infinity,
      discountRate: 0.03,
    });
  });

  it("parses the shared Rauh scenario without clamping the residual share", () => {
    const params = parseScenarioParams(
      new URLSearchParams(
        `date=2025-10-17&base=${WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES}&exre=1&avoidance=0&unannounced=0.48&yield=0.02`
      ),
      DEFAULT_PARAMS
    );

    expect(params).toEqual({
      snapshotDate: "2025-10-17",
      residencyExclusionIds: RAUH_EXCLUSIONS,
      departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
      wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
      excludeRealEstate: true,
      includeIncomeTaxEffects: true,
      wealthGrowthRate: 0,
      incomeGrowthRate: 0,
      avoidanceRate: 0,
      unannouncedDepartureShare: 0.48,
      migrationSemiElasticity: 12,
      annualReturnRate: 0,
      incomeYieldRate: 0.02,
      incomeTaxAttributionRate: 1,
      horizonYears: Infinity,
      discountRate: 0.03,
    });
  });

  it("converts legacy baseline param to residency exclusions", () => {
    const params = parseScenarioParams(
      new URLSearchParams("baseline=67.2"),
      DEFAULT_PARAMS
    );

    expect(params.residencyExclusionIds).toEqual(RAUH_EXCLUSIONS);
  });

  it("converts legacy enum values to residency exclusion sets", () => {
    const allParams = parseScenarioParams(
      new URLSearchParams("base=all"),
      DEFAULT_PARAMS
    );
    const departureParams = parseScenarioParams(
      new URLSearchParams("base=afterDepartures"),
      DEFAULT_PARAMS
    );

    expect(allParams.residencyExclusionIds).toEqual([]);
    expect(departureParams.residencyExclusionIds).toEqual(RAUH_EXCLUSIONS);
  });

  it("converts legacy five-year return-share URLs into annual return hazards", () => {
    const params = parseScenarioParams(
      new URLSearchParams("return=0.25"),
      DEFAULT_PARAMS
    );

    expect(params.annualReturnRate).toBeCloseTo(0.06, 6);
    expect(params.includeIncomeTaxEffects).toBe(true);
  });

  it("enables PIT effects only for legacy links that carry the old return or income keys", () => {
    const legacy = parseScenarioParams(new URLSearchParams("income=2"), DEFAULT_PARAMS);
    expect(legacy.includeIncomeTaxEffects).toBe(true);

    // A current link with a stage-two setting but no pit flag leaves it off.
    const current = parseScenarioParams(new URLSearchParams("yield=0.015"), DEFAULT_PARAMS);
    expect(current.includeIncomeTaxEffects).toBe(false);
    expect(current.incomeYieldRate).toBe(0.015);
  });

  it("round-trips every assumption set and a stage-two edit with income-tax effects off", () => {
    const cases = {
      "berkeley-like": { ...DEFAULT_PARAMS, excludeRealEstate: false, avoidanceRate: 0.1, incomeYieldRate: 0.01 },
      "yield tweaked, pit off": { ...DEFAULT_PARAMS, incomeYieldRate: 0.015 },
      "horizon 25, pit off": { ...DEFAULT_PARAMS, horizonYears: 25 },
      "pit on": { ...DEFAULT_PARAMS, includeIncomeTaxEffects: true, horizonYears: 25 },
      "Rauh 10.32": { ...DEFAULT_PARAMS, departureResponseMode: DEPARTURE_RESPONSE_MODES.ELASTICITY, migrationSemiElasticity: 10.32 },
    };

    for (const [name, params] of Object.entries(cases)) {
      const query = serializeScenarioParams(params, DEFAULT_PARAMS);
      const parsed = parseScenarioParams(query, DEFAULT_PARAMS);
      expect(parsed, name).toEqual(params);
    }
  });

  it("says pit=0 when a stage-two setting is in the link with effects off", () => {
    const query = serializeScenarioParams({ ...DEFAULT_PARAMS, incomeYieldRate: 0.015 }, DEFAULT_PARAMS);
    expect(query.get("pit")).toBe("0");
    expect(serializeScenarioParams(DEFAULT_PARAMS, DEFAULT_PARAMS).has("pit")).toBe(false);
  });

  it("reads a horizon at the slider's top stop as the perpetuity", () => {
    const parsed = parseScenarioParams(new URLSearchParams("horizon=100&pit=1"), DEFAULT_PARAMS);
    expect(parsed.horizonYears).toBe(Infinity);
    expect(serializeScenarioParams(parsed, DEFAULT_PARAMS).get("horizon")).toBeNull();
  });

  it("serializes only values that differ from defaults", () => {
    const query = serializeScenarioParams(
      {
        ...DEFAULT_PARAMS,
        snapshotDate: "2025-10-17",
        residencyExclusionIds: RAUH_EXCLUSIONS,
        departureResponseMode: DEPARTURE_RESPONSE_MODES.ELASTICITY,
        excludeRealEstate: true,
        includeIncomeTaxEffects: true,
      },
      DEFAULT_PARAMS
    ).toString();

    expect(query).toBe(
      `date=2025-10-17&exclude=${encodeURIComponent(RAUH_EXCLUSIONS.join(","))}&departures=${DEPARTURE_RESPONSE_MODES.ELASTICITY}&exre=1&pit=1`
    );
  });

  it("serializes non-default payment timing", () => {
    const query = serializeScenarioParams(
      {
        ...DEFAULT_PARAMS,
        wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS,
      },
      DEFAULT_PARAMS
    ).toString();

    expect(query).toBe("payment=installments");
  });

  it("serializes PIT attribution controls", () => {
    const query = serializeScenarioParams(
      {
        ...DEFAULT_PARAMS,
        includeIncomeTaxEffects: true,
        incomeTaxAttributionRate: 0.35,
      },
      DEFAULT_PARAMS
    ).toString();

    expect(query).toBe("pit=1&attrib=0.35");
  });

  it("builds a shareable href", () => {
    const href = buildScenarioHref(
      "/",
      {
        ...DEFAULT_PARAMS,
        avoidanceRate: 0.15,
      },
      DEFAULT_PARAMS
    );

    expect(href).toBe("/?avoidance=0.15");
  });

  it("round-trips the Rauh residual share used in shared links", () => {
    const params = {
      ...DEFAULT_PARAMS,
      snapshotDate: "2025-10-17",
      residencyExclusionIds: RAUH_EXCLUSIONS,
      excludeRealEstate: true,
      avoidanceRate: 0,
      unannouncedDepartureShare: 0.48,
      incomeYieldRate: 0.02,
    };

    const query = serializeScenarioParams(params, DEFAULT_PARAMS).toString();
    const parsed = parseScenarioParams(new URLSearchParams(query), DEFAULT_PARAMS);

    expect(query).toContain("unannounced=0.48");
    expect(parsed.unannouncedDepartureShare).toBe(0.48);
    expect(parsed.residencyExclusionIds).toEqual(RAUH_EXCLUSIONS);
  });

  it("reads an old income-tax link as the uniform-yield method", () => {
    const defaults = { ...DEFAULT_PARAMS, incomeTaxMethod: "filings", cohortIncomeTaxB: 4.3 };
    const old = parseScenarioParams(new URLSearchParams("pit=1&yield=0.02"), defaults);
    const current = parseScenarioParams(new URLSearchParams("pit=1&pitmethod=filings"), defaults);
    const untouched = parseScenarioParams(new URLSearchParams(""), defaults);

    expect(old.incomeTaxMethod).toBe("yield");
    expect(current.incomeTaxMethod).toBe("filings");
    expect(untouched.incomeTaxMethod).toBe("filings");
  });

  it("always names the method when income-tax effects are on", () => {
    const defaults = { ...DEFAULT_PARAMS, incomeTaxMethod: "filings", cohortIncomeTaxB: 4.3 };
    const href = buildScenarioHref("/x", { ...defaults, includeIncomeTaxEffects: true }, defaults);
    const roundTrip = parseScenarioParams(new URLSearchParams(href.split("?")[1]), defaults);

    expect(href).toContain("pitmethod=filings");
    expect(roundTrip.incomeTaxMethod).toBe("filings");
    expect(roundTrip.includeIncomeTaxEffects).toBe(true);
  });
});
