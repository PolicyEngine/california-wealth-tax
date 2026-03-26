"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { calculateFiscalImpact } from "@/lib/calculator";
import { formatBillions } from "@/lib/format";
import { estimateCaliforniaIncomeTaxB } from "@/lib/incomeTaxLookup";
import {
  buildAnnualCashFlows,
  DEFAULT_CASH_FLOW_START_YEAR,
} from "@/lib/cashFlow";
import Slider from "@/app/components/Slider";
import {
  buildScenarioHref,
  parseScenarioParams,
} from "@/lib/scenarioUrl";
import incomeTaxLookup from "@/data/income_tax_lookup.json";

const WEALTH_TAX_RATE = 0.05;
const CASH_FLOW_DISPLAY_YEARS = 30;

// From Rauh et al. replication data (Raw_Data_Collection.xlsx)
const WEALTH_BASE_OPTIONS = {
  all: {
    label: "All Forbes CA billionaires",
    wealthB: 2149.6,
    realEstateB: 4.74,
    description: "214 billionaires, Oct 2025 Forbes snapshot",
  },
  afterDepartures: {
    label: "After known departures",
    wealthB: 1343.2,
    realEstateB: 4.21,
    description: "205 billionaires who stayed through Dec 31, 2025",
  },
};

function ChartLoading() {
  return (
    <div className="h-[320px] animate-pulse rounded-[24px] border border-[var(--gray-200)] bg-[var(--gray-50)]" />
  );
}

const CashFlowChart = dynamic(() => import("@/app/components/CashFlowChart"), {
  loading: () => <ChartLoading />,
});

const WaterfallChart = dynamic(() => import("@/app/components/WaterfallChart"), {
  loading: () => <ChartLoading />,
});

const PRESETS = {
  saez: {
    label: "Saez headline",
    description: "Calibrated to Saez et al.'s roughly $100B static score.",
    href: "https://eml.berkeley.edu/~saez/galle-gamage-saez-shanskeCAbillionairetaxDec25.pdf",
    params: {
      wealthBase: "all",
      excludeRealEstate: false,
      avoidanceRate: 0.1,
      departureRate: 0,
      annualReturnRate: 0,
      incomeYieldRate: 0.01,
      growthRate: 0,
      horizonYears: Infinity,
      discountRate: 0.03,
    },
  },
  rauh: {
    label: "Rauh headline",
    description: "Calibrated to Rauh et al.'s revenue and net-cost headline.",
    href: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6340778",
    params: {
      wealthBase: "afterDepartures",
      excludeRealEstate: true,
      avoidanceRate: 0.15,
      departureRate: 0,
      annualReturnRate: 0,
      incomeYieldRate: 0.036,
      growthRate: 0,
      horizonYears: Infinity,
      discountRate: 0.03,
    },
  },
};

const DEFAULT_PARAMS = {
  wealthBase: "all",
  excludeRealEstate: false,
  avoidanceRate: 0.1,
  departureRate: 0,
  annualReturnRate: 0,
  incomeYieldRate: 0.01,
  growthRate: 0,
  horizonYears: Infinity,
  discountRate: 0.03,
};

function computeBaselineWealthTaxB(wealthBase, excludeRealEstate) {
  const option = WEALTH_BASE_OPTIONS[wealthBase] ?? WEALTH_BASE_OPTIONS.all;
  const wealth = option.wealthB - (excludeRealEstate ? option.realEstateB : 0);
  return wealth * WEALTH_TAX_RATE;
}

const formatPercent = (value, decimals = 0) =>
  `${(value * 100).toFixed(decimals)}%`;

const toPercentInputValue = (value, decimals = 0) =>
  (value * 100).toFixed(decimals);

const formatYears = (value) =>
  value === Infinity ? "Perpetuity" : `${value} years`;

function taxableWealthBaseFromBaseline(baselineWealthTaxB) {
  return baselineWealthTaxB / WEALTH_TAX_RATE;
}

function buildPresetDetails(params) {
  const baselineWealthTaxB = computeBaselineWealthTaxB(
    params.wealthBase,
    params.excludeRealEstate
  );
  const taxableWealthBaseB = taxableWealthBaseFromBaseline(baselineWealthTaxB);
  const annualTaxableIncomeB = taxableWealthBaseB * params.incomeYieldRate;
  const annualIncomeTaxB = estimateCaliforniaIncomeTaxB(
    annualTaxableIncomeB,
    incomeTaxLookup
  );
  const result = calculateFiscalImpact({
    baselineWealthTaxB,
    avoidanceRate: params.avoidanceRate,
    departureRate: params.departureRate,
    annualIncomeTaxB,
    horizonYears: params.horizonYears,
    discountRate: params.discountRate,
    annualReturnRate: params.annualReturnRate,
    growthRate: params.growthRate,
  });

  return {
    baselineWealthTaxB,
    taxableWealthBaseB,
    annualTaxableIncomeB,
    annualIncomeTaxB,
    result,
  };
}

const PRESET_DETAILS = {
  saez: buildPresetDetails(PRESETS.saez.params),
  rauh: buildPresetDetails(PRESETS.rauh.params),
};

export default function Home() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [hasSyncedUrlState, setHasSyncedUrlState] = useState(false);
  const [copyStatus, setCopyStatus] = useState("idle");

  const baselineWealthTaxB = useMemo(
    () => computeBaselineWealthTaxB(params.wealthBase, params.excludeRealEstate),
    [params.wealthBase, params.excludeRealEstate]
  );
  const taxableWealthBaseB = useMemo(
    () => taxableWealthBaseFromBaseline(baselineWealthTaxB),
    [baselineWealthTaxB]
  );
  const annualTaxableIncomeB = useMemo(
    () => taxableWealthBaseB * params.incomeYieldRate,
    [params.incomeYieldRate, taxableWealthBaseB]
  );
  const annualIncomeTaxB = useMemo(
    () => estimateCaliforniaIncomeTaxB(annualTaxableIncomeB, incomeTaxLookup),
    [annualTaxableIncomeB]
  );
  const result = useMemo(
    () =>
      calculateFiscalImpact({
        baselineWealthTaxB,
        avoidanceRate: params.avoidanceRate,
        departureRate: params.departureRate,
        annualIncomeTaxB,
        horizonYears: params.horizonYears,
        discountRate: params.discountRate,
        annualReturnRate: params.annualReturnRate,
        growthRate: params.growthRate,
      }),
    [annualIncomeTaxB, baselineWealthTaxB, params]
  );
  const cashFlow = useMemo(
    () =>
      buildAnnualCashFlows({
        wealthTaxCollected: result.wealthTaxCollected,
        annualIncomeTaxLost: result.annualIncomeTaxLost,
        annualReturnRate: params.annualReturnRate,
        discountRate: params.discountRate,
        horizonYears: params.horizonYears,
        displayYears: CASH_FLOW_DISPLAY_YEARS,
        startYear: DEFAULT_CASH_FLOW_START_YEAR,
        growthRate: params.growthRate,
      }),
    [
      params.annualReturnRate,
      params.discountRate,
      params.growthRate,
      params.horizonYears,
      result.annualIncomeTaxLost,
      result.wealthTaxCollected,
    ]
  );

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setParams(parseScenarioParams(searchParams, DEFAULT_PARAMS));
    setHasSyncedUrlState(true);
  }, []);

  useEffect(() => {
    if (!hasSyncedUrlState) {
      return;
    }

    const nextHref = buildScenarioHref(
      window.location.pathname,
      params,
      DEFAULT_PARAMS
    );
    const currentHref = `${window.location.pathname}${window.location.search}`;

    if (nextHref !== currentHref) {
      window.history.replaceState(null, "", nextHref);
    }
  }, [hasSyncedUrlState, params]);

  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }

    const timeout = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  function update(key, value) {
    setParams((prev) => ({ ...prev, [key]: value }));
    setActivePreset(null);
  }

  const [activePreset, setActivePreset] = useState("saez");

  function applyPreset(key) {
    setParams({ ...PRESETS[key].params });
    setActivePreset(key);
  }

  async function copyScenarioLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyStatus("Copied link");
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  const impliedCaRate =
    annualTaxableIncomeB > 0 ? annualIncomeTaxB / annualTaxableIncomeB : 0;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="bg-[var(--teal-700)] px-6 py-4 text-white">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-xl font-bold">
            California wealth tax fiscal impact calculator
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-3 pb-2">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    activePreset === key
                      ? "border-[var(--teal-600)] bg-[var(--teal-700)] text-white"
                      : "border-[var(--gray-300)] bg-white text-[var(--gray-700)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                  }`}
                  title={preset.description}
                >
                  {preset.label}
                </button>
                <a
                  href={preset.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--teal-600)] underline decoration-[var(--teal-300)] underline-offset-2 hover:text-[var(--teal-700)]"
                  title="Read the paper"
                >
                  paper
                </a>
              </span>
            ))}
            <button
              type="button"
              onClick={copyScenarioLink}
              className="rounded-full border border-[var(--teal-200)] bg-[var(--teal-50)] px-4 py-2 text-sm font-medium text-[var(--teal-700)] transition-colors hover:border-[var(--teal-600)] hover:bg-white"
            >
              {copyStatus === "idle" ? "Copy scenario link" : copyStatus}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="space-y-10">

              <AssumptionSection title="Tax base">
                <div className="space-y-4 py-4">
                  <p className="text-sm font-semibold tracking-[-0.01em] text-[var(--gray-700)]">
                    Who is included?
                  </p>
                  <div className="space-y-2">
                    {Object.entries(WEALTH_BASE_OPTIONS).map(([key, option]) => (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                          params.wealthBase === key
                            ? "border-[var(--teal-600)] bg-[var(--teal-50)]"
                            : "border-[var(--gray-200)] bg-white hover:border-[var(--gray-300)]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="wealthBase"
                          value={key}
                          checked={params.wealthBase === key}
                          onChange={() => update("wealthBase", key)}
                          className="accent-[var(--teal-600)]"
                        />
                        <div>
                          <span className="text-sm font-semibold text-[var(--gray-700)]">
                            {option.label}
                          </span>
                          <span className="ml-2 text-sm text-[var(--gray-500)]">
                            ${option.wealthB.toLocaleString()}B
                          </span>
                          <p className="text-xs text-[var(--gray-500)]">
                            {option.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="py-4">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={params.excludeRealEstate}
                      onChange={(e) =>
                        update("excludeRealEstate", e.target.checked)
                      }
                      className="h-4 w-4 rounded accent-[var(--teal-600)]"
                    />
                    <div>
                      <span className="text-sm font-semibold text-[var(--gray-700)]">
                        Exclude directly-held real estate
                      </span>
                      <span className="ml-2 text-sm text-[var(--gray-500)]">
                        −$
                        {(
                          WEALTH_BASE_OPTIONS[params.wealthBase]?.realEstateB ??
                          0
                        ).toFixed(1)}
                        B
                      </span>
                      <p className="text-xs text-[var(--gray-500)]">
                        The bill excludes real estate held directly by
                        billionaires (already subject to property tax)
                      </p>
                    </div>
                  </label>
                </div>

                <div className="flex items-center justify-between border-t border-[var(--gray-100)] py-4">
                  <span className="text-sm text-[var(--gray-600)]">
                    Gross wealth tax score
                  </span>
                  <span className="text-sm font-semibold text-[var(--teal-700)]">
                    {formatBillions(baselineWealthTaxB)}
                  </span>
                </div>
              </AssumptionSection>

              <AssumptionSection title="Behavior">
                <Slider
                  label="Avoidance rate"
                  value={params.avoidanceRate}
                  onChange={(nextValue) => update("avoidanceRate", nextValue)}
                  min={0}
                  max={0.5}
                  step={0.01}
                  format={(value) => formatPercent(value)}
                  description=""
                  quickPicks={[
                    { label: "5%", value: 0.05 },
                    { label: "15%", value: 0.15 },
                    { label: "30%", value: 0.3 },
                  ]}
                  minLabel="0%"
                  maxLabel="50%"
                  inputSuffix="%"
                  toInputValue={(value) => toPercentInputValue(value)}
                  fromInputValue={(rawValue) => Number(rawValue) / 100}
                />

                <Slider
                  label="Departure rate"
                  value={params.departureRate}
                  onChange={(nextValue) => update("departureRate", nextValue)}
                  min={0}
                  max={0.6}
                  step={0.01}
                  format={(value) => formatPercent(value)}
                  description=""
                  quickPicks={[
                    { label: "0%", value: 0 },
                    { label: "15%", value: 0.15 },
                    { label: "30%", value: 0.3 },
                  ]}
                  minLabel="0%"
                  maxLabel="60%"
                  inputSuffix="%"
                  toInputValue={(value) => toPercentInputValue(value)}
                  fromInputValue={(rawValue) => Number(rawValue) / 100}
                />

                {params.departureRate > 0 && (
                <Slider
                  label="Annual return rate of remaining movers"
                  value={params.annualReturnRate}
                  onChange={(nextValue) =>
                    update("annualReturnRate", nextValue)
                  }
                  min={0}
                  max={0.5}
                  step={0.01}
                  format={(value) => formatPercent(value)}
                  description=""
                  quickPicks={[
                    { label: "0%", value: 0 },
                    { label: "5%", value: 0.05 },
                    { label: "15%", value: 0.15 },
                  ]}
                  minLabel="0%"
                  maxLabel="50%"
                  inputSuffix="%"
                  toInputValue={(value) => toPercentInputValue(value)}
                  fromInputValue={(rawValue) => Number(rawValue) / 100}
                />
                )}
              </AssumptionSection>

              {params.departureRate > 0 && (
              <AssumptionSection title="Income / wealth">
                <Slider
                  label="Annual CA-taxable income / taxed wealth"
                  value={params.incomeYieldRate}
                  onChange={(nextValue) => update("incomeYieldRate", nextValue)}
                  min={0.005}
                  max={0.05}
                  step={0.001}
                  format={(value) => formatPercent(value, 1)}
                  description=""
                  quickPicks={[
                    { label: "1.0%", value: 0.01 },
                    { label: "1.7%", value: 0.017 },
                    { label: "3.6%", value: 0.036 },
                  ]}
                  minLabel="0.5%"
                  maxLabel="5.0%"
                  inputSuffix="%"
                  toInputValue={(value) => toPercentInputValue(value, 1)}
                  fromInputValue={(rawValue) => Number(rawValue) / 100}
                />

                <Slider
                  label="Annual real wealth/income growth"
                  value={params.growthRate}
                  onChange={(nextValue) => update("growthRate", nextValue)}
                  min={0}
                  max={0.1}
                  step={0.005}
                  format={(value) => formatPercent(value, 1)}
                  description=""
                  quickPicks={[
                    { label: "0%", value: 0 },
                    { label: "4%", value: 0.04 },
                    { label: "7%", value: 0.07 },
                  ]}
                  minLabel="0%"
                  maxLabel="10%"
                  inputSuffix="%"
                  toInputValue={(value) => toPercentInputValue(value, 1)}
                  fromInputValue={(rawValue) => Number(rawValue) / 100}
                />

                <Slider
                  label="Income tax horizon"
                  value={
                    params.horizonYears === Infinity ? 100 : params.horizonYears
                  }
                  onChange={(nextValue) =>
                    update("horizonYears", nextValue >= 100 ? Infinity : nextValue)
                  }
                  min={5}
                  max={100}
                  step={5}
                  format={(value) => formatYears(value >= 100 ? Infinity : value)}
                  description=""
                  quickPicks={[
                    { label: "10y", value: 10 },
                    { label: "30y", value: 30 },
                    { label: "Perpetuity", value: 100 },
                  ]}
                  minLabel="5 years"
                  maxLabel="Perpetuity"
                  showNumberInput={false}
                />

                <Slider
                  label="Real discount rate"
                  value={params.discountRate}
                  onChange={(nextValue) => update("discountRate", nextValue)}
                  min={0.01}
                  max={0.07}
                  step={0.005}
                  format={(value) => formatPercent(value, 1)}
                  description=""
                  quickPicks={[
                    { label: "2%", value: 0.02 },
                    { label: "3%", value: 0.03 },
                    { label: "5%", value: 0.05 },
                  ]}
                  minLabel="1%"
                  maxLabel="7%"
                  inputSuffix="%"
                  toInputValue={(value) => toPercentInputValue(value, 1)}
                  fromInputValue={(rawValue) => Number(rawValue) / 100}
                />
              </AssumptionSection>
              )}
            </div>

            <aside className="self-start rounded-[28px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_30px_80px_-48px_rgba(40,94,97,0.55)] xl:sticky xl:top-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-500)]">
                Net fiscal impact
              </p>
              <div
                className={`mt-6 text-5xl font-semibold tracking-[-0.05em] ${
                  result.netFiscalImpact >= 0
                    ? "text-[var(--teal-600)]"
                    : "text-[var(--red-600)]"
                }`}
              >
                {formatBillions(result.netFiscalImpact, { showPlus: true })}
              </div>

              <div className="mt-8">
                <WaterfallChart waterfall={result.waterfall} />
              </div>

              <details className="mt-6 text-sm text-[var(--gray-600)]">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--gray-500)] hover:text-[var(--teal-700)]">
                  Derivation
                </summary>
                <div className="mt-2 divide-y divide-[var(--gray-100)]">
                  <div className="flex items-center justify-between py-2">
                    <span>Taxable wealth base</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(taxableWealthBaseB)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span>Annual CA-taxable income</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(annualTaxableIncomeB)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span>CA income tax (PolicyEngine)</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(annualIncomeTaxB)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span>Effective CA rate</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatPercent(impliedCaRate, 1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span>Wealth tax collected</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(result.wealthTaxCollected)}
                    </span>
                  </div>
                  {result.annualIncomeTaxLost > 0 && (
                  <>
                  <div className="flex items-center justify-between py-2">
                    <span>Annual income tax lost</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      ${result.annualIncomeTaxLost.toFixed(1)}B/yr
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span>PV of lost income tax</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(result.pvLostIncomeTax)}
                    </span>
                  </div>
                  </>
                  )}
                </div>
              </details>
            </aside>
          </div>
        </div>

        <section className="space-y-4 border-t border-[var(--gray-200)] pt-10">
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--gray-700)]">
            Year-by-year cash flow
          </h3>
          <div className="rounded-[28px] border border-[var(--gray-200)] bg-white p-5 shadow-[0_30px_80px_-48px_rgba(40,94,97,0.45)]">
            <CashFlowChart data={cashFlow.rows} />
          </div>
          {cashFlow.isTruncated && (
            <p className="text-xs leading-5 text-[var(--gray-400)]">
              The chart shows the first {cashFlow.displayedYears} years. The
              headline PV still uses the full
              {params.horizonYears === Infinity
                ? " perpetuity assumption."
                : ` ${params.horizonYears}-year horizon.`}
            </p>
          )}
        </section>

        <details className="group border-t border-[var(--gray-200)] pt-6">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--gray-600)] hover:text-[var(--teal-700)]">
            Calibration notes
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-4 text-sm leading-6 text-[var(--gray-600)] xl:grid-cols-2">
            <div className="space-y-2 rounded-[20px] bg-[var(--gray-50)] p-4">
              <p className="font-semibold text-[var(--gray-700)]">
                <a
                  href={PRESETS.saez.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-[var(--gray-300)] underline-offset-2 hover:decoration-[var(--teal-600)]"
                >
                  Galle, Gamage, Saez &amp; Shanske (2026)
                </a>
              </p>
              <p>
                All 214 Forbes CA billionaires, including those who
                subsequently left. After{" "}
                {formatPercent(PRESETS.saez.params.avoidanceRate)} avoidance
                the tax collects about{" "}
                {formatBillions(PRESET_DETAILS.saez.result.wealthTaxCollected)},
                close to the paper&apos;s roughly $100B headline.
              </p>
            </div>

            <div className="space-y-2 rounded-[20px] bg-[var(--gray-50)] p-4">
              <p className="font-semibold text-[var(--gray-700)]">
                <a
                  href={PRESETS.rauh.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-[var(--gray-300)] underline-offset-2 hover:decoration-[var(--teal-600)]"
                >
                  Rauh, Jaros, Kearney, Doran &amp; Cosso (2026)
                </a>
              </p>
              <p>
                Uses only the 205 billionaires who stayed through Dec 31, 2025
                (excluding 9 known departures worth $806B), excludes
                directly-held real estate, and applies{" "}
                {formatPercent(PRESETS.rauh.params.avoidanceRate)} avoidance.
                Gross score:{" "}
                {formatBillions(PRESET_DETAILS.rauh.baselineWealthTaxB)}.
              </p>
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                Income / wealth yield set to{" "}
                {formatPercent(PRESETS.rauh.params.incomeYieldRate, 1)},{" "}
                {formatPercent(PRESETS.rauh.params.discountRate, 1)} discount
                rate, perpetuity horizon. Billionaire-level data from Rauh
                et al.&apos;s replication repository.
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-[var(--gray-500)]">
            Both presets are simplified calibrations, not full replications.
            Income tax is derived from PolicyEngine&apos;s{" "}
            <code className="text-xs">ca_income_tax</code> variable via a
            precomputed lookup at billionaire-scale income levels.
          </p>
        </details>
      </main>
    </div>
  );
}

function AssumptionSection({ title, children }) {
  return (
    <section className="space-y-4 border-t border-[var(--gray-200)] pt-6 first:border-t-0 first:pt-0">
      <h4 className="text-lg font-semibold tracking-[-0.02em] text-[var(--gray-700)]">
        {title}
      </h4>
      <div className="divide-y divide-[var(--gray-100)]">{children}</div>
    </section>
  );
}
