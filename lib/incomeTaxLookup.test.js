import { describe, expect, it } from "vitest";
import { estimateCaliforniaIncomeTaxB } from "./incomeTaxLookup";

const lookup = [
  { income: 1_000_000_000, ca_tax: 132_000_000, eff_ca_rate: 0.132 },
  { income: 10_000_000_000, ca_tax: 1_330_000_000, eff_ca_rate: 0.133 },
  { income: 50_000_000_000, ca_tax: 6_650_000_000, eff_ca_rate: 0.133 },
];

describe("estimateCaliforniaIncomeTaxB", () => {
  it("interpolates between lookup points", () => {
    expect(estimateCaliforniaIncomeTaxB(5.5, lookup)).toBeCloseTo(0.731, 3);
  });

  it("uses the endpoint effective rate outside the lookup range", () => {
    expect(estimateCaliforniaIncomeTaxB(75, lookup)).toBeCloseTo(9.975, 3);
  });
});
