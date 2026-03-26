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
      baselineWealthTaxB: 109.5,
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
      baselineWealthTaxB: 67.2,
      avoidanceRate: 0.15,
      departureRate: 0.3,
      annualReturnRate: 0,
      incomeYieldRate: 0.036,
      growthRate: 0,
      horizonYears: Infinity,
      discountRate: 0.03,
    },
  },
};

const DEFAULT_PARAMS = {
  baselineWealthTaxB: 109.5,
  avoidanceRate: 0.1,
  departureRate: 0,
  annualReturnRate: 0,
  incomeYieldRate: 0.01,
  growthRate: 0,
  horizonYears: Infinity,
  discountRate: 0.03,
};

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
  const taxableWealthBaseB = taxableWealthBaseFromBaseline(
    params.baselineWealthTaxB
  );
  const annualTaxableIncomeB = taxableWealthBaseB * params.incomeYieldRate;
  const annualIncomeTaxB = estimateCaliforniaIncomeTaxB(
    annualTaxableIncomeB,
    incomeTaxLookup
  );
  const result = calculateFiscalImpact({ ...params, annualIncomeTaxB });

  return {
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

  const taxableWealthBaseB = useMemo(
    () => taxableWealthBaseFromBaseline(params.baselineWealthTaxB),
    [params.baselineWealthTaxB]
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
        ...params,
        annualIncomeTaxB,
      }),
    [annualIncomeTaxB, params]
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
          <p className="mt-1 text-sm text-teal-100">
            How much would California&apos;s proposed one-time 5% billionaire
            tax actually raise? Adjust the assumptions and find out.
          </p>
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

              <AssumptionSection
                title="Tax base"
                description="Start with the gross one-time wealth tax score before households react."
              >
                <Slider
                  label="Baseline wealth tax score"
                  value={params.baselineWealthTaxB}
                  onChange={(nextValue) =>
                    update("baselineWealthTaxB", nextValue)
                  }
                  min={20}
                  max={140}
                  step={0.5}
                  format={(value) => `$${value.toFixed(1)}B`}
                  description="Gross one-time revenue before avoidance and departures."
                  quickPicks={[
                    { label: "$67B (Rauh)", value: 67.2 },
                    { label: "$110B (Saez)", value: 109.5 },
                  ]}
                  minLabel="$20B"
                  maxLabel="$140B"
                  inputSuffix="B"
                  toInputValue={(value) => value.toFixed(1)}
                />
              </AssumptionSection>

              <AssumptionSection
                title="Behavior"
                description="Model how much of the base disappears through avoidance and migration."
              >
                <Slider
                  label="Avoidance rate"
                  value={params.avoidanceRate}
                  onChange={(nextValue) => update("avoidanceRate", nextValue)}
                  min={0}
                  max={0.5}
                  step={0.01}
                  format={(value) => formatPercent(value)}
                  description="Fraction of the wealth tax base lost to avoidance or evasion."
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
                  description="Fraction of billionaire households who leave California to avoid the tax."
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
                  description="Share of departed billionaires who return each year."
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
              <AssumptionSection
                title="Income / wealth"
                description="How much California-taxable income do billionaires generate relative to their wealth, and how does it grow over time?"
              >
                <Slider
                  label="Annual CA-taxable income / taxed wealth"
                  value={params.incomeYieldRate}
                  onChange={(nextValue) => update("incomeYieldRate", nextValue)}
                  min={0.005}
                  max={0.05}
                  step={0.001}
                  format={(value) => formatPercent(value, 1)}
                  description="Annual California-taxable income as a share of the wealth base. Wages, dividends, and capital gains all run through the same state rate schedule at this level."
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
                  description="Annual real growth rate of billionaire wealth and California-taxable income. Increases the income tax lost each year movers stay away."
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
                  description="How many years to keep pricing income-tax losses under the departure and return path."
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
                  description="Discount rate applied to future income tax losses."
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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--teal-700)]">
                Live estimate
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
                Net fiscal impact
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--gray-600)]">
                One-time wealth-tax revenue minus the present value of future
                California income tax lost from billionaire departures.
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

              <div className="mt-6 divide-y divide-[var(--gray-100)] text-sm text-[var(--gray-600)]">
                <div className="flex items-center justify-between py-3">
                  <span>Taxable wealth base</span>
                  <span className="font-semibold text-[var(--gray-700)]">
                    {formatBillions(taxableWealthBaseB)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span>Derived annual CA-taxable income</span>
                  <span className="font-semibold text-[var(--gray-700)]">
                    {formatBillions(annualTaxableIncomeB)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span>PolicyEngine CA income tax</span>
                  <span className="font-semibold text-[var(--gray-700)]">
                    {formatBillions(annualIncomeTaxB)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span>Implied CA effective rate</span>
                  <span className="font-semibold text-[var(--gray-700)]">
                    {formatPercent(impliedCaRate, 1)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span>Wealth tax collected</span>
                  <span className="font-semibold text-[var(--gray-700)]">
                    {formatBillions(result.wealthTaxCollected)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span>Initial annual income tax lost</span>
                  <span className="font-semibold text-[var(--gray-700)]">
                    ${result.annualIncomeTaxLost.toFixed(1)}B/yr
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span>Implied five-year return share</span>
                  <span className="font-semibold text-[var(--gray-700)]">
                    {formatPercent(result.fiveYearReturnShare, 1)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span>PV of lost income tax</span>
                  <span className="font-semibold text-[var(--gray-700)]">
                    {formatBillions(result.pvLostIncomeTax)}
                  </span>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <section className="space-y-4 border-t border-[var(--gray-200)] pt-10">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--gray-700)]">
              Year-by-year cash flow
            </h3>
            <p className="max-w-4xl text-sm leading-6 text-[var(--gray-600)]">
              The wealth tax lands once in {DEFAULT_CASH_FLOW_START_YEAR}, then
              California loses income tax each year movers stay away. This
              chart shows the annual cash-flow path only.
            </p>
          </div>
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
                A static revenue estimate with no behavioral response. The
                gross score is{" "}
                {formatBillions(PRESETS.saez.params.baselineWealthTaxB)}; after{" "}
                {formatPercent(PRESETS.saez.params.avoidanceRate)} avoidance
                the tax collects about{" "}
                {formatBillions(PRESET_DETAILS.saez.result.wealthTaxCollected)},
                close to the paper&apos;s roughly $100B headline. No
                departures and no income-tax dynamics.
              </p>
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                Other values filled by this app:{" "}
                {formatPercent(PRESETS.saez.params.incomeYieldRate, 1)} annual
                income / wealth,{" "}
                {formatBillions(PRESET_DETAILS.saez.annualTaxableIncomeB)}/yr
                taxable income,{" "}
                {formatBillions(PRESET_DETAILS.saez.annualIncomeTaxB)}/yr CA
                income tax,{" "}
                {formatPercent(PRESETS.saez.params.discountRate, 1)} discount
                rate, perpetuity horizon.
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
                Accounts for a smaller tax base (
                {formatBillions(PRESETS.rauh.params.baselineWealthTaxB)} gross
                score), {formatPercent(PRESETS.rauh.params.avoidanceRate)}{" "}
                avoidance, and{" "}
                {formatPercent(PRESETS.rauh.params.departureRate)} departures.
                When future income-tax losses are included, the net fiscal
                impact is about{" "}
                {formatBillions(PRESET_DETAILS.rauh.result.netFiscalImpact)}.
              </p>
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                This app fits their headline by setting income / wealth yield
                to {formatPercent(PRESETS.rauh.params.incomeYieldRate, 1)},
                implying{" "}
                {formatBillions(PRESET_DETAILS.rauh.taxableWealthBaseB)} of
                taxed wealth,{" "}
                {formatBillions(PRESET_DETAILS.rauh.annualTaxableIncomeB)}/yr
                taxable income, and{" "}
                {formatBillions(PRESET_DETAILS.rauh.annualIncomeTaxB)}/yr CA
                income tax. Zero return migration,{" "}
                {formatPercent(PRESETS.rauh.params.discountRate, 1)} discount
                rate, perpetuity horizon.
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

function AssumptionSection({ title, description, children }) {
  return (
    <section className="space-y-5 border-t border-[var(--gray-200)] pt-6 first:border-t-0 first:pt-0">
      <div className="space-y-1">
        <h4 className="text-lg font-semibold tracking-[-0.02em] text-[var(--gray-700)]">
          {title}
        </h4>
        <p className="text-sm leading-6 text-[var(--gray-600)]">{description}</p>
      </div>
      <div className="divide-y divide-[var(--gray-100)]">{children}</div>
    </section>
  );
}
