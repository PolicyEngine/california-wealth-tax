import { describe, expect, it } from "vitest";
import {
  buildScenarioHref,
  parseScenarioParams,
  serializeScenarioParams,
} from "./scenarioUrl";
import { WEALTH_TAX_PAYMENT_MODES } from "./calculator";
import { INCOME_TAX_MODES, WEALTH_BASES } from "./microModel";
import { DEPARTURE_RESPONSE_MODES } from "./departureResponse";
import {
  DEFAULT_INCOME_TAX_MOVER_IDS,
  PRE_SNAPSHOT_EXCLUSION_IDS,
  RESIDENCY_ONLY_EXCLUSION_IDS,
} from "./residencyAdjustments";

const RAUH_EXCLUSIONS = [
  ...RESIDENCY_ONLY_EXCLUSION_IDS,
  ...PRE_SNAPSHOT_EXCLUSION_IDS,
];

const DEFAULT_PARAMS = {
  snapshotDate: "2026-03-27",
  residencyExclusionIds: [],
  departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
  wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
  excludeRealEstate: false,
  includeIncomeTaxEffects: false,
  incomeTaxMoverIds: DEFAULT_INCOME_TAX_MOVER_IDS,
  incomeTaxMode: INCOME_TAX_MODES.YIELD,
  wealthGrowthRate: 0,
  avoidanceRate: 0.1,
  unannouncedDepartureShare: 0,
  migrationSemiElasticity: 12,
  annualReturnRate: 0,
  incomeYieldRate: 0.02,
  aggregateAnnualIncomeTaxB: 4.55,
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
      incomeTaxMoverIds: DEFAULT_INCOME_TAX_MOVER_IDS,
      incomeTaxMode: INCOME_TAX_MODES.YIELD,
      wealthGrowthRate: 0,
      avoidanceRate: 0.15,
      unannouncedDepartureShare: 0,
      migrationSemiElasticity: 10.3,
      annualReturnRate: 0.05,
      incomeYieldRate: 0.036,
      aggregateAnnualIncomeTaxB: 4.55,
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
      incomeTaxMoverIds: DEFAULT_INCOME_TAX_MOVER_IDS,
      incomeTaxMode: INCOME_TAX_MODES.YIELD,
      wealthGrowthRate: 0,
      avoidanceRate: 0,
      unannouncedDepartureShare: 0.48,
      migrationSemiElasticity: 12,
      annualReturnRate: 0,
      incomeYieldRate: 0.02,
      aggregateAnnualIncomeTaxB: 4.55,
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

  it("enables PIT effects for legacy links that include PIT-specific inputs", () => {
    const params = parseScenarioParams(
      new URLSearchParams("yield=0.02&horizon=10"),
      DEFAULT_PARAMS
    );

    expect(params.includeIncomeTaxEffects).toBe(true);
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

  it("omits inactive income-tax controls when income-tax effects are off", () => {
    const query = serializeScenarioParams(
      {
        ...DEFAULT_PARAMS,
        includeIncomeTaxEffects: false,
        annualReturnRate: 0.2,
        incomeTaxMoverIds: ["page"],
        incomeYieldRate: 0.01,
        incomeTaxAttributionRate: 0.35,
        horizonYears: 10,
        discountRate: 0.045,
      },
      DEFAULT_PARAMS
    ).toString();
    const parsed = parseScenarioParams(new URLSearchParams(query), DEFAULT_PARAMS);

    expect(query).toBe("discount=0.045");
    expect(parsed.includeIncomeTaxEffects).toBe(false);
    expect(parsed.discountRate).toBe(0.045);
  });

  it("does not reopen wealth-tax-only links with income-tax effects enabled", () => {
    const query = serializeScenarioParams(
      {
        ...DEFAULT_PARAMS,
        includeIncomeTaxEffects: false,
        incomeYieldRate: 0.01,
      },
      DEFAULT_PARAMS
    ).toString();
    const parsed = parseScenarioParams(new URLSearchParams(query), DEFAULT_PARAMS);

    expect(query).toBe("");
    expect(parsed.includeIncomeTaxEffects).toBe(false);
  });

  it("round-trips an explicit empty income-tax mover list when PIT is on", () => {
    const query = serializeScenarioParams(
      {
        ...DEFAULT_PARAMS,
        includeIncomeTaxEffects: true,
        incomeTaxMoverIds: [],
      },
      DEFAULT_PARAMS
    ).toString();
    const parsed = parseScenarioParams(new URLSearchParams(query), DEFAULT_PARAMS);

    expect(query).toBe("movers=none&pit=1");
    expect(parsed.includeIncomeTaxEffects).toBe(true);
    expect(parsed.incomeTaxMoverIds).toEqual([]);
  });

  it("allows non-migration erosion above 50%", () => {
    const params = parseScenarioParams(
      new URLSearchParams("avoidance=0.9"),
      DEFAULT_PARAMS
    );

    expect(params.avoidanceRate).toBe(0.9);
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

  it("round-trips the FTB aggregate income-tax mode", () => {
    const params = {
      ...DEFAULT_PARAMS,
      includeIncomeTaxEffects: true,
      incomeTaxMode: INCOME_TAX_MODES.FTB_AGGREGATE,
      aggregateAnnualIncomeTaxB: 5.8,
    };

    const query = serializeScenarioParams(params, DEFAULT_PARAMS).toString();
    const parsed = parseScenarioParams(
      new URLSearchParams(query),
      DEFAULT_PARAMS
    );

    expect(query).toContain("pitmode=ftbAggregate");
    expect(query).toContain("pitc=5.8");
    // The yield slider is unused in FTB mode, so it stays out of the URL.
    expect(query).not.toContain("yield=");
    expect(parsed.incomeTaxMode).toBe(INCOME_TAX_MODES.FTB_AGGREGATE);
    expect(parsed.aggregateAnnualIncomeTaxB).toBe(5.8);
    expect(parsed.includeIncomeTaxEffects).toBe(true);
  });

  it("keeps the FTB aggregate level out of yield-mode links", () => {
    const params = {
      ...DEFAULT_PARAMS,
      includeIncomeTaxEffects: true,
      incomeYieldRate: 0.03,
      aggregateAnnualIncomeTaxB: 5.8,
    };

    const query = serializeScenarioParams(params, DEFAULT_PARAMS).toString();

    expect(query).toContain("yield=0.03");
    expect(query).not.toContain("pitc=");
  });

  it("treats FTB params in a link as enabling income tax effects", () => {
    const params = parseScenarioParams(
      new URLSearchParams("pitmode=ftbAggregate&pitc=3.3"),
      DEFAULT_PARAMS
    );

    expect(params.includeIncomeTaxEffects).toBe(true);
    expect(params.incomeTaxMode).toBe(INCOME_TAX_MODES.FTB_AGGREGATE);
    expect(params.aggregateAnnualIncomeTaxB).toBe(3.3);
  });
});
