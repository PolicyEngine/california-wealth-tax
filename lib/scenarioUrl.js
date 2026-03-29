import { WEALTH_BASES } from "./microModel";
import { WEALTH_TAX_PAYMENT_MODES } from "./calculator";
import { DEPARTURE_RESPONSE_MODES } from "./departureResponse";

const WEALTH_TAX_RATE = 0.05;

const ENUM_PARAM_CONFIG = {
  snapshotDate: {
    queryKey: "date",
    type: "string",
  },
  wealthBase: {
    queryKey: "base",
    values: Object.values(WEALTH_BASES),
  },
  departureResponseMode: {
    queryKey: "departures",
    values: Object.values(DEPARTURE_RESPONSE_MODES),
  },
  wealthTaxPaymentMode: {
    queryKey: "payment",
    values: Object.values(WEALTH_TAX_PAYMENT_MODES),
  },
  excludeRealEstate: {
    queryKey: "exre",
    type: "boolean",
  },
};

const PARAM_CONFIG = {
  wealthGrowthRate: {
    queryKey: "wgrowth",
    min: 0,
    max: 0.15,
    step: 0.005,
    decimals: 3,
  },
  avoidanceRate: {
    queryKey: "avoidance",
    min: 0,
    max: 0.5,
    step: 0.01,
    decimals: 2,
  },
  unannouncedDepartureShare: {
    queryKey: "unannounced",
    min: 0,
    max: 0.7,
    step: 0.01,
    decimals: 2,
  },
  migrationSemiElasticity: {
    queryKey: "elasticity",
    min: 0,
    max: 20,
    step: 0.1,
    decimals: 1,
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

function normalizeLegacyWealthBase(rawValue) {
  if (rawValue === "all") {
    return WEALTH_BASES.ALL_FORBES;
  }
  if (rawValue === "afterDepartures") {
    return WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES;
  }
  return rawValue;
}

function legacyBaselineToWealthBase(baselineWealthTaxB) {
  if (baselineWealthTaxB < 80) {
    return WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES;
  }
  if (baselineWealthTaxB < 102) {
    return WEALTH_BASES.CORRECTED_BASE;
  }
  return WEALTH_BASES.ALL_FORBES;
}

function legacyBaselineForIncomeYield(wealthBase) {
  if (wealthBase === WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES) {
    return 67.2;
  }
  if (wealthBase === WEALTH_BASES.CORRECTED_BASE) {
    return 94.2;
  }
  return 109.5;
}

export function parseScenarioParams(searchParams, defaultParams) {
  const params = { ...defaultParams };

  for (const [key, config] of Object.entries(ENUM_PARAM_CONFIG)) {
    const rawValue = searchParams.get(config.queryKey);
    if (rawValue == null) continue;

    if (config.type === "boolean") {
      params[key] = rawValue === "1" || rawValue === "true";
      continue;
    }

    if (config.type === "string") {
      params[key] = rawValue;
      continue;
    }

    const normalizedValue =
      key === "wealthBase" ? normalizeLegacyWealthBase(rawValue) : rawValue;
    if (config.values?.includes(normalizedValue)) {
      params[key] = normalizedValue;
    }
  }

  const legacyBaseline = searchParams.get("baseline");
  if (legacyBaseline != null && searchParams.get("base") == null) {
    const parsed = parseNumber(legacyBaseline);
    if (parsed != null) {
      params.wealthBase = legacyBaselineToWealthBase(parsed);
    }
  }

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
              legacyBaselineForIncomeYield(params.wealthBase)
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

  for (const [key, config] of Object.entries(ENUM_PARAM_CONFIG)) {
    const value = params[key];
    const defaultValue = defaultParams[key];

    if (config.type === "boolean") {
      if (value !== defaultValue) {
        searchParams.set(config.queryKey, value ? "1" : "0");
      }
      continue;
    }

    if (config.type === "string") {
      if (value !== defaultValue) {
        searchParams.set(config.queryKey, value);
      }
      continue;
    }

    if (String(value) !== String(defaultValue)) {
      searchParams.set(config.queryKey, String(value));
    }
  }

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
