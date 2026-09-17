/**
 * An order-robust bridge between two assumption sets.
 *
 * Moving from one scenario to another one assumption at a time gives each
 * assumption a different dollar value depending on the order of the steps,
 * because assumptions interact (migration matters more once income-tax losses
 * count). The Shapley value averages each assumption's marginal effect over
 * every ordering, so the contributions sum exactly to the gap and do not
 * depend on an arbitrary sequence. The range across orderings is reported
 * next to it.
 */
import { BERKELEY_ASSUMPTIONS, HOOVER_ASSUMPTIONS } from "./presets";

function factorial(n) {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

function sameValue(a, b) {
  return Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((entry, index) => entry === b[index])
    : a === b;
}

/**
 * @param {Object} start - parameters of the starting scenario
 * @param {Object} end - parameters of the ending scenario
 * @param {Array<{id: string, label: string, keys: string[]}>} factors - each
 *   factor switches its keys from the start value to the end value
 * @param {(params: Object) => number} evaluate - the metric being bridged
 */
export function shapleyBridge({ start, end, factors, evaluate }) {
  const factorKeys = new Set(factors.flatMap((factor) => factor.keys));
  const uncovered = Object.keys(end).filter(
    (key) => !sameValue(start[key], end[key]) && !factorKeys.has(key)
  );

  if (uncovered.length > 0) {
    throw new Error(
      `Bridge factors do not cover every difference: ${uncovered.join(", ")}`
    );
  }

  const n = factors.length;
  const values = new Map();
  const valueOf = (mask) => {
    if (!values.has(mask)) {
      const params = { ...start };

      factors.forEach((factor, index) => {
        if (mask & (1 << index)) {
          factor.keys.forEach((key) => {
            params[key] = end[key];
          });
        }
      });
      values.set(mask, evaluate(params));
    }

    return values.get(mask);
  };
  const size = (mask) => {
    let count = 0;

    for (let bits = mask; bits; bits >>= 1) {
      count += bits & 1;
    }

    return count;
  };

  const contributions = factors.map((factor, index) => {
    const bit = 1 << index;
    let value = 0;
    let min = Infinity;
    let max = -Infinity;

    for (let mask = 0; mask < 1 << n; mask += 1) {
      if (mask & bit) {
        continue;
      }

      const marginal = valueOf(mask | bit) - valueOf(mask);
      const weight =
        (factorial(size(mask)) * factorial(n - size(mask) - 1)) / factorial(n);

      value += weight * marginal;
      min = Math.min(min, marginal);
      max = Math.max(max, marginal);
    }

    return { id: factor.id, label: factor.label, value, min, max };
  });

  return {
    startValue: valueOf(0),
    endValue: valueOf((1 << n) - 1),
    contributions,
  };
}

// From the Berkeley assumptions to the Hoover assumptions, on the same roster.
export const BERKELEY_TO_HOOVER_FACTORS = [
  {
    id: "residency",
    label: "Treat documented departures as effective",
    keys: ["residencyExclusionIds"],
  },
  {
    id: "migration",
    label: "Further migration before valuation",
    keys: ["unannouncedDepartureShare"],
  },
  {
    id: "incomeTax",
    label: "Count movers' future income tax",
    keys: ["includeIncomeTaxEffects", "incomeYieldRate"],
  },
  {
    id: "erosion",
    label: "Drop the 10% avoidance haircut",
    keys: ["avoidanceRate"],
  },
  {
    id: "realEstate",
    label: "Exclude directly held real estate",
    keys: ["excludeRealEstate"],
  },
];

/**
 * The metric is net present value as of 2026 for every scenario, so that a
 * one-time receipt and a stream of losses are on the same footing at both ends.
 */
export function berkeleyToHooverBridge(scoreParams) {
  return shapleyBridge({
    start: BERKELEY_ASSUMPTIONS,
    end: HOOVER_ASSUMPTIONS,
    factors: BERKELEY_TO_HOOVER_FACTORS,
    evaluate: (params) => scoreParams(params).result.netFiscalImpact,
  });
}
