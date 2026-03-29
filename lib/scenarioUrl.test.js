import { describe, expect, it } from "vitest";
import {
  buildScenarioHref,
  parseScenarioParams,
  serializeScenarioParams,
} from "./scenarioUrl";
import { WEALTH_TAX_PAYMENT_MODES } from "./calculator";
import { WEALTH_BASES } from "./microModel";
import { DEPARTURE_RESPONSE_MODES } from "./departureResponse";

const DEFAULT_PARAMS = {
  snapshotDate: "2026-03-27",
  wealthBase: WEALTH_BASES.ALL_FORBES,
  departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
  wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
  excludeRealEstate: false,
  wealthGrowthRate: 0,
  avoidanceRate: 0.1,
  unannouncedDepartureShare: 0,
  migrationSemiElasticity: 12,
  annualReturnRate: 0,
  incomeYieldRate: 0.01,
  horizonYears: Infinity,
  discountRate: 0.03,
};

describe("scenarioUrl helpers", () => {
  it("parses scenario params from URL search params", () => {
    const params = parseScenarioParams(
      new URLSearchParams(
        `date=2025-10-17&base=${WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES}&departures=${DEPARTURE_RESPONSE_MODES.ELASTICITY}&exre=1&avoidance=0.15&elasticity=10.3&annual_return=0.05&yield=0.036&horizon=inf&discount=0.03`
      ),
      DEFAULT_PARAMS
    );

    expect(params).toEqual({
      snapshotDate: "2025-10-17",
      wealthBase: WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES,
      departureResponseMode: DEPARTURE_RESPONSE_MODES.ELASTICITY,
      wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
      excludeRealEstate: true,
      wealthGrowthRate: 0,
      avoidanceRate: 0.15,
      unannouncedDepartureShare: 0,
      migrationSemiElasticity: 10.3,
      annualReturnRate: 0.05,
      incomeYieldRate: 0.036,
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
      wealthBase: WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES,
      departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
      wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
      excludeRealEstate: true,
      wealthGrowthRate: 0,
      avoidanceRate: 0,
      unannouncedDepartureShare: 0.48,
      migrationSemiElasticity: 12,
      annualReturnRate: 0,
      incomeYieldRate: 0.02,
      horizonYears: Infinity,
      discountRate: 0.03,
    });
  });

  it("converts legacy baseline param to wealthBase toggle", () => {
    const params = parseScenarioParams(
      new URLSearchParams("baseline=67.2"),
      DEFAULT_PARAMS
    );

    expect(params.wealthBase).toBe(WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES);
  });

  it("converts legacy enum values to new wealth-base keys", () => {
    const allParams = parseScenarioParams(
      new URLSearchParams("base=all"),
      DEFAULT_PARAMS
    );
    const departureParams = parseScenarioParams(
      new URLSearchParams("base=afterDepartures"),
      DEFAULT_PARAMS
    );

    expect(allParams.wealthBase).toBe(WEALTH_BASES.ALL_FORBES);
    expect(departureParams.wealthBase).toBe(
      WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES
    );
  });

  it("converts legacy five-year return-share URLs into annual return hazards", () => {
    const params = parseScenarioParams(
      new URLSearchParams("return=0.25"),
      DEFAULT_PARAMS
    );

    expect(params.annualReturnRate).toBeCloseTo(0.06, 6);
  });

  it("serializes only values that differ from defaults", () => {
    const query = serializeScenarioParams(
      {
        ...DEFAULT_PARAMS,
        snapshotDate: "2025-10-17",
        wealthBase: WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES,
        departureResponseMode: DEPARTURE_RESPONSE_MODES.ELASTICITY,
        excludeRealEstate: true,
      },
      DEFAULT_PARAMS
    ).toString();

    expect(query).toBe(
      `date=2025-10-17&base=${WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES}&departures=${DEPARTURE_RESPONSE_MODES.ELASTICITY}&exre=1`
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
      wealthBase: WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES,
      excludeRealEstate: true,
      avoidanceRate: 0,
      unannouncedDepartureShare: 0.48,
      incomeYieldRate: 0.02,
    };

    const query = serializeScenarioParams(params, DEFAULT_PARAMS).toString();
    const parsed = parseScenarioParams(new URLSearchParams(query), DEFAULT_PARAMS);

    expect(query).toContain("unannounced=0.48");
    expect(parsed.unannouncedDepartureShare).toBe(0.48);
  });
});
