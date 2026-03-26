const WEALTH_TAX_RATE = 0.05;

const PARAM_CONFIG = {
  baselineWealthTaxB: {
    queryKey: "baseline",
    min: 20,
    max: 140,
    step: 0.5,
    decimals: 1,
  },
  avoidanceRate: {
    queryKey: "avoidance",
    min: 0,
    max: 0.5,
    step: 0.01,
    decimals: 2,
  },
  departureRate: {
    queryKey: "departure",
    min: 0,
    max: 0.6,
    step: 0.01,
    decimals: 2,
  },
  annualReturnRate: {
    queryKey: "annual_return",
    min: 0,
    max: 0.5,
    step: 0.01,
    decimals: 2,
  },
  incomeYieldRate: {
    queryKey: "yield",
    min: 0.005,
    max: 0.05,
    step: 0.001,
    decimals: 3,
  },
  growthRate: {
    queryKey: "growth",
    min: 0,
    max: 0.1,
    step: 0.005,
    decimals: 3,
  },
  horizonYears: {
    queryKey: "horizon",
    min: 5,
    max: 100,
    step: 5,
  },
  discountRate: {
    queryKey: "discount",
    min: 0.01,
    max: 0.07,
    step: 0.005,
    decimals: 3,
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapToStep(value, { min, step }) {
  if (!step) {
    return value;
  }

  const snapped = min + Math.round((value - min) / step) * step;
  return Number(snapped.toFixed(6));
}

function parseNumber(rawValue) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function legacyFiveYearReturnToAnnualRate(cumulativeReturnRate) {
  return 1 - Math.pow(1 - cumulativeReturnRate, 1 / 5);
}

function taxableWealthBaseFromBaseline(baselineWealthTaxB) {
  return baselineWealthTaxB / WEALTH_TAX_RATE;
}

function legacyIncomeToYieldRate(annualIncomeB, baselineWealthTaxB) {
  return annualIncomeB / taxableWealthBaseFromBaseline(baselineWealthTaxB);
}

function serializeNumber(value, decimals) {
  if (decimals === 0) {
    return value.toFixed(0);
  }
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

export function parseScenarioParams(searchParams, defaultParams) {
  const params = { ...defaultParams };

  for (const [key, config] of Object.entries(PARAM_CONFIG)) {
    let rawValue = searchParams.get(config.queryKey);

    if (key === "annualReturnRate" && rawValue == null) {
      const legacyRawValue = searchParams.get("return");

      if (legacyRawValue != null) {
        const parsedLegacy = parseNumber(legacyRawValue);

        if (parsedLegacy != null) {
          const boundedLegacy = clamp(parsedLegacy, 0, 0.8);
          params[key] = snapToStep(
            legacyFiveYearReturnToAnnualRate(boundedLegacy),
            config
          );
        }
      }

      continue;
    }

    if (key === "incomeYieldRate" && rawValue == null) {
      const legacyRawValue = searchParams.get("income");

      if (legacyRawValue != null) {
        const parsedLegacy = parseNumber(legacyRawValue);

        if (parsedLegacy != null) {
          params[key] = snapToStep(
            legacyIncomeToYieldRate(
              parsedLegacy,
              params.baselineWealthTaxB
            ),
            config
          );
        }
      }

      continue;
    }

    if (rawValue == null) {
      continue;
    }

    if (key === "horizonYears" && rawValue === "inf") {
      params[key] = Infinity;
      continue;
    }

    const parsed = parseNumber(rawValue);

    if (parsed == null) {
      continue;
    }

    const bounded = clamp(parsed, config.min, config.max);
    params[key] = snapToStep(bounded, config);
  }

  return params;
}

export function serializeScenarioParams(params, defaultParams) {
  const searchParams = new URLSearchParams();

  for (const [key, config] of Object.entries(PARAM_CONFIG)) {
    const value = params[key];
    const defaultValue = defaultParams[key];

    const serializedValue =
      key === "horizonYears" && value === Infinity
        ? "inf"
        : serializeNumber(value, config.decimals ?? 0);
    const serializedDefault =
      key === "horizonYears" && defaultValue === Infinity
        ? "inf"
        : serializeNumber(defaultValue, config.decimals ?? 0);

    if (serializedValue !== serializedDefault) {
      searchParams.set(config.queryKey, serializedValue);
    }
  }

  return searchParams;
}

export function buildScenarioHref(pathname, params, defaultParams) {
  const searchParams = serializeScenarioParams(params, defaultParams);
  const query = searchParams.toString();

  return query ? `${pathname}?${query}` : pathname;
}
