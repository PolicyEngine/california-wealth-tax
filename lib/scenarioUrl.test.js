import { describe, expect, it } from "vitest";
import {
  buildScenarioHref,
  parseScenarioParams,
  serializeScenarioParams,
} from "./scenarioUrl";

const DEFAULT_PARAMS = {
  baselineWealthTaxB: 109.5,
  avoidanceRate: 0.1,
  departureRate: 0,
  annualReturnRate: 0,
  incomeYieldRate: 0.01,
  growthRate: 0,
  horizonYears: Infinity,
  discountRate: 0.03,
};

describe("scenarioUrl helpers", () => {
  it("parses scenario params from URL search params", () => {
    const params = parseScenarioParams(
      new URLSearchParams(
        "baseline=109.5&avoidance=0.10&departure=0.00&annual_return=0.15&yield=0.01&horizon=inf&discount=0.03"
      ),
      DEFAULT_PARAMS
    );

    expect(params).toEqual({
      baselineWealthTaxB: 109.5,
      avoidanceRate: 0.1,
      departureRate: 0,
      annualReturnRate: 0.15,
      incomeYieldRate: 0.01,
      growthRate: 0,
      horizonYears: Infinity,
      discountRate: 0.03,
    });
  });

  it("converts legacy five-year return-share URLs into annual return hazards", () => {
    const params = parseScenarioParams(
      new URLSearchParams("return=0.25"),
      DEFAULT_PARAMS
    );

    expect(params.annualReturnRate).toBeCloseTo(0.06, 6);
  });

  it("converts legacy annual income URLs into yield-based assumptions", () => {
    const params = parseScenarioParams(
      new URLSearchParams("baseline=109.5&income=21.8"),
      DEFAULT_PARAMS
    );

    expect(params.incomeYieldRate).toBeCloseTo(0.01, 6);
  });

  it("serializes only values that differ from defaults", () => {
    const query = serializeScenarioParams(
      {
        ...DEFAULT_PARAMS,
        departureRate: 0.3,
        horizonYears: 30,
      },
      DEFAULT_PARAMS
    ).toString();

    expect(query).toBe("departure=0.3&horizon=30");
  });

  it("builds a shareable href", () => {
    const href = buildScenarioHref(
      "/",
      {
        ...DEFAULT_PARAMS,
        incomeYieldRate: 0.036,
      },
      DEFAULT_PARAMS
    );

    expect(href).toBe("/?yield=0.036");
  });
});
