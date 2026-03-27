import { describe, expect, it } from "vitest";
import {
  buildScenarioHref,
  parseScenarioParams,
  serializeScenarioParams,
} from "./scenarioUrl";

const DEFAULT_PARAMS = {
  snapshotDate: "2026-03-27",
  wealthBase: "all",
  excludeRealEstate: false,
  wealthGrowthRate: 0,
  avoidanceRate: 0.1,
  unannouncedDepartureShare: 0,
  annualReturnRate: 0,
  incomeYieldRate: 0.01,
  horizonYears: Infinity,
  discountRate: 0.03,
};

describe("scenarioUrl helpers", () => {
  it("parses scenario params from URL search params", () => {
    const params = parseScenarioParams(
      new URLSearchParams(
        "date=2025-10-17&base=afterDepartures&exre=1&avoidance=0.15&annual_return=0.05&yield=0.036&horizon=inf&discount=0.03"
      ),
      DEFAULT_PARAMS
    );

    expect(params).toEqual({
      snapshotDate: "2025-10-17",
      wealthBase: "afterDepartures",
      excludeRealEstate: true,
      wealthGrowthRate: 0,
      avoidanceRate: 0.15,
      unannouncedDepartureShare: 0,
      annualReturnRate: 0.05,
      incomeYieldRate: 0.036,
      horizonYears: Infinity,
      discountRate: 0.03,
    });
  });

  it("converts legacy baseline param to wealthBase toggle", () => {
    const params = parseScenarioParams(
      new URLSearchParams("baseline=67.2"),
      DEFAULT_PARAMS
    );

    expect(params.wealthBase).toBe("afterDepartures");
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
        wealthBase: "afterDepartures",
        excludeRealEstate: true,
      },
      DEFAULT_PARAMS
    ).toString();

    expect(query).toBe("date=2025-10-17&base=afterDepartures&exre=1");
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
});
