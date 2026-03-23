import { describe, expect, it } from "vitest";
import { formatBillions } from "./format";
import { buildWaterfallData } from "./waterfall";

describe("presentation helpers", () => {
  it("formats negative and positive headline amounts with the expected sign", () => {
    expect(formatBillions(-24.716, { showPlus: true })).toBe("-$24.7B");
    expect(formatBillions(98.55, { showPlus: true })).toBe("+$98.5B");
  });

  it("anchors a negative net total below zero in the waterfall", () => {
    const data = buildWaterfallData([
      { label: "Baseline", value: 67.2 },
      { label: "Avoidance", value: -10.08 },
      { label: "Departures (wealth tax)", value: -17.136 },
      { label: "Income tax loss (PV)", value: -64.7 },
    ]);

    const netImpact = data[data.length - 1];

    expect(netImpact.label).toBe("Net impact");
    expect(netImpact.value).toBeCloseTo(-24.716, 6);
    expect(netImpact.base).toBeCloseTo(-24.716, 6);
    expect(netImpact.height).toBeCloseTo(24.716, 6);
    expect(netImpact.isNegative).toBe(true);
  });
});
