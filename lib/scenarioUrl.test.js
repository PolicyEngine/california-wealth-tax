import { describe, expect, it } from "vitest";
import {
  buildScenarioHref,
  parseActiveTab,
  parseScenarioParams,
  serializeScenarioParams,
} from "./scenarioUrl";

const DEFAULT_PARAMS = {
  baselineWealthTaxB: 94.2,
  avoidanceRate: 0.15,
  departureRate: 0.15,
  returnRate: 0.25,
  annualIncomeTaxB: 4.3,
  horizonYears: 30,
  discountRate: 0.03,
};

describe("scenarioUrl helpers", () => {
  it("parses scenario params from URL search params", () => {
    const params = parseScenarioParams(
      new URLSearchParams(
        "baseline=109.5&avoidance=0.10&departure=0.00&return=0&incomeTax=2.9&horizon=inf&discount=0.03"
      ),
      DEFAULT_PARAMS
    );

    expect(params).toEqual({
      baselineWealthTaxB: 109.5,
      avoidanceRate: 0.1,
      departureRate: 0,
      returnRate: 0,
      annualIncomeTaxB: 2.9,
      horizonYears: Infinity,
      discountRate: 0.03,
    });
  });

  it("serializes only values that differ from defaults", () => {
    const query = serializeScenarioParams(
      {
        ...DEFAULT_PARAMS,
        departureRate: 0.3,
        horizonYears: Infinity,
      },
      DEFAULT_PARAMS
    ).toString();

    expect(query).toBe("departure=0.3&horizon=inf");
  });

  it("builds a shareable href with non-default tab state", () => {
    const href = buildScenarioHref(
      "/",
      "ltcg",
      "calculator",
      DEFAULT_PARAMS,
      DEFAULT_PARAMS
    );

    expect(href).toBe("/?tab=ltcg");
    expect(
      parseActiveTab(new URLSearchParams("tab=ltcg"), ["calculator", "ltcg"], "calculator")
    ).toBe("ltcg");
  });
});
