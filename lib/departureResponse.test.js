import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEALTH_TAX_RATE_DELTA,
  DEPARTURE_RESPONSE_MODES,
  effectiveAdditionalDepartureShare,
  impliedRemainerElasticity,
  residualDepartureShareFromElasticity,
  totalLossShareFromElasticity,
} from "./departureResponse";

describe("departureResponse helpers", () => {
  it("maps a total elasticity to a total loss share", () => {
    expect(totalLossShareFromElasticity(12)).toBeCloseTo(0.4512, 4);
    expect(totalLossShareFromElasticity(13)).toBeCloseTo(0.4780, 4);
  });

  it("converts total elasticity into a residual share after observed departures", () => {
    const residualShare = residualDepartureShareFromElasticity({
      totalElasticity: 12,
      observedLossShare: 0.2834,
    });

    expect(residualShare).toBeCloseTo(0.2341, 3);
  });

  it("computes the implied remainer elasticity after observed departures", () => {
    const residualElasticity = impliedRemainerElasticity({
      totalElasticity: 13,
      observedLossShare: 0.2834,
    });

    expect(residualElasticity).toBeCloseTo(6.34, 2);
  });

  it("returns zero residual response when observed departures already exceed the total response", () => {
    expect(
      residualDepartureShareFromElasticity({
        totalElasticity: 4,
        observedLossShare: 0.2834,
      })
    ).toBe(0);
  });

  it("returns the correct effective share for each response mode", () => {
    expect(
      effectiveAdditionalDepartureShare({
        mode: DEPARTURE_RESPONSE_MODES.SHARE,
        share: 0.08,
        totalElasticity: 12,
        observedLossShare: 0.2834,
      })
    ).toBeCloseTo(0.08, 6);

    expect(
      effectiveAdditionalDepartureShare({
        mode: DEPARTURE_RESPONSE_MODES.ELASTICITY,
        share: 0.08,
        totalElasticity: 12,
        observedLossShare: 0.2834,
        taxRateDelta: DEFAULT_WEALTH_TAX_RATE_DELTA,
      })
    ).toBeCloseTo(0.2341, 3);
  });
});
