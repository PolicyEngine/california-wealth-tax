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
  returnRate: {
    queryKey: "return",
    min: 0,
    max: 0.8,
    step: 0.05,
    decimals: 2,
  },
  annualIncomeTaxB: {
    queryKey: "incomeTax",
    min: 1,
    max: 8,
    step: 0.1,
    decimals: 1,
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

function serializeNumber(value, decimals) {
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

export function parseScenarioParams(searchParams, defaultParams) {
  const params = { ...defaultParams };

  for (const [key, config] of Object.entries(PARAM_CONFIG)) {
    const rawValue = searchParams.get(config.queryKey);

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

export function parseActiveTab(searchParams, tabs, defaultTab) {
  const requestedTab = searchParams.get("tab");
  return tabs.includes(requestedTab) ? requestedTab : defaultTab;
}

export function buildScenarioHref(pathname, activeTab, defaultTab, params, defaultParams) {
  const searchParams = serializeScenarioParams(params, defaultParams);

  if (activeTab !== defaultTab) {
    searchParams.set("tab", activeTab);
  }

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
