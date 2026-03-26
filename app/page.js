"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { calculateFiscalImpact } from "@/lib/calculator";
import { formatBillions } from "@/lib/format";
import { computeMicroResults } from "@/lib/microModel";
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
import billionairesData from "@/data/billionaires.json";

const BillionaireTable = dynamic(
  () => import("@/app/components/BillionaireTable"),
  { loading: () => <ChartLoading /> }
);

const WEALTH_TAX_RATE = 0.05;
const CASH_FLOW_DISPLAY_YEARS = 30;
const MONTHS_SNAPSHOT_TO_VALUATION = 14.5;

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
      wealthGrowthRate: 0,
      avoidanceRate: 0.1,
      unannouncedDepartureShare: 0,
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
      wealthGrowthRate: 0,
      avoidanceRate: 0.15,
      unannouncedDepartureShare: 0,
      annualReturnRate: 0,
      incomeYieldRate: 0.023,
      growthRate: 0,
      horizonYears: Infinity,
      discountRate: 0.03,
    },
  },
};

const DEFAULT_PARAMS = {
  wealthBase: "all",
  excludeRealEstate: false,
  wealthGrowthRate: 0,
  avoidanceRate: 0.1,
  unannouncedDepartureShare: 0,
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

function buildPresetDetails(params) {
  const micro = computeMicroResults({
    billionaires: billionairesData,
    incomeTaxLookup,
    wealthBase: params.wealthBase,
    excludeRealEstate: params.excludeRealEstate,
    incomeYieldRate: params.incomeYieldRate,
  });
  const result = calculateFiscalImpact({
    grossWealthTaxB: micro.grossWealthTaxB,
    avoidanceRate: params.avoidanceRate,
    moverIncomeTaxB: micro.moverIncomeTaxB,
    horizonYears: params.horizonYears,
    discountRate: params.discountRate,
    annualReturnRate: params.annualReturnRate,
    growthRate: params.growthRate,
  });

  return { micro, result };
}

const PRESET_DETAILS = {
  saez: buildPresetDetails(PRESETS.saez.params),
  rauh: buildPresetDetails(PRESETS.rauh.params),
};

export default function Home() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [hasSyncedUrlState, setHasSyncedUrlState] = useState(false);
  const [copyStatus, setCopyStatus] = useState("idle");

  const micro = useMemo(
    () =>
      computeMicroResults({
        billionaires: billionairesData,
        incomeTaxLookup,
        wealthBase: params.wealthBase,
        excludeRealEstate: params.excludeRealEstate,
        incomeYieldRate: params.incomeYieldRate,
        wealthGrowthRate: params.wealthGrowthRate,
        unannouncedDepartureShare: params.unannouncedDepartureShare,
      }),
    [
      params.wealthBase,
      params.excludeRealEstate,
      params.incomeYieldRate,
      params.wealthGrowthRate,
      params.unannouncedDepartureShare,
    ]
  );
  const result = useMemo(
    () =>
      calculateFiscalImpact({
        grossWealthTaxB: micro.grossWealthTaxB,
        avoidanceRate: params.avoidanceRate,
        moverIncomeTaxB: micro.moverIncomeTaxB,
        horizonYears: params.horizonYears,
        discountRate: params.discountRate,
        annualReturnRate: params.annualReturnRate,
        growthRate: params.growthRate,
      }),
    [micro, params]
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
    [params, result]
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

                <div className="py-4">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={params.wealthGrowthRate > 0}
                      onChange={(e) =>
                        update("wealthGrowthRate", e.target.checked ? 0.075 : 0)
                      }
                      className="h-4 w-4 rounded accent-[var(--teal-600)]"
                    />
                    <div>
                      <span className="text-sm font-semibold text-[var(--gray-700)]">
                        Project wealth to Dec 31, 2026
                      </span>
                      <p className="text-xs text-[var(--gray-500)]">
                        Forbes data is from Oct 2025. The bill taxes wealth as
                        of Dec 31, 2026 — {MONTHS_SNAPSHOT_TO_VALUATION} months
                        later.
                      </p>
                    </div>
                  </label>
                  {params.wealthGrowthRate > 0 && (
                    <div className="ml-7 mt-2">
                      <Slider
                        label="Annual real wealth growth"
                        value={params.wealthGrowthRate}
                        onChange={(nextValue) =>
                          update("wealthGrowthRate", nextValue)
                        }
                        min={0.01}
                        max={0.15}
                        step={0.005}
                        format={(value) => formatPercent(value, 1)}
                        description=""
                        quickPicks={[
                          { label: "3%", value: 0.03 },
                          { label: "7.5% (Saez)", value: 0.075 },
                          { label: "10%", value: 0.1 },
                        ]}
                        minLabel="1%"
                        maxLabel="15%"
                        inputSuffix="%"
                        toInputValue={(value) =>
                          toPercentInputValue(value, 1)
                        }
                        fromInputValue={(rawValue) => Number(rawValue) / 100}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-[var(--gray-100)] py-4">
                  <span className="text-sm text-[var(--gray-600)]">
                    Gross wealth tax (with phase-in)
                  </span>
                  <span className="text-sm font-semibold text-[var(--teal-700)]">
                    {formatBillions(micro.grossWealthTaxB)}
                  </span>
                </div>
              </AssumptionSection>

              <AssumptionSection title="Behavioral response">
                <Slider
                  label="Avoidance / evasion"
                  value={params.avoidanceRate}
                  onChange={(nextValue) => update("avoidanceRate", nextValue)}
                  min={0}
                  max={0.5}
                  step={0.01}
                  format={(value) => formatPercent(value)}
                  description=""
                  quickPicks={[
                    { label: "5%", value: 0.05 },
                    { label: "10% (Saez)", value: 0.1 },
                    { label: "15% (Rauh)", value: 0.15 },
                  ]}
                  minLabel="0%"
                  maxLabel="50%"
                  inputSuffix="%"
                  toInputValue={(value) => toPercentInputValue(value)}
                  fromInputValue={(rawValue) => Number(rawValue) / 100}
                />

                <Slider
                  label="Additional unannounced departures"
                  value={params.unannouncedDepartureShare}
                  onChange={(nextValue) =>
                    update("unannouncedDepartureShare", nextValue)
                  }
                  min={0}
                  max={0.3}
                  step={0.01}
                  format={(value) => formatPercent(value)}
                  description=""
                  quickPicks={[
                    { label: "0%", value: 0 },
                    { label: "5%", value: 0.05 },
                    { label: "10%", value: 0.1 },
                  ]}
                  minLabel="0%"
                  maxLabel="30%"
                  inputSuffix="%"
                  toInputValue={(value) => toPercentInputValue(value)}
                  fromInputValue={(rawValue) => Number(rawValue) / 100}
                />
              </AssumptionSection>

              {(micro.movers.length > 0 || params.unannouncedDepartureShare > 0) && (
              <AssumptionSection title="Income tax loss from departures">
                <Slider
                  label="Annual return rate"
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
                <div className="py-3 text-sm text-[var(--gray-600)]">
                  {micro.movers.length > 0 && (
                    <span>
                      <span className="font-semibold text-[var(--gray-700)]">
                        {micro.movers.length} known departures
                      </span>
                      {params.unannouncedDepartureShare > 0 && (
                        <span>
                          {" "}
                          +{" "}
                          {formatPercent(params.unannouncedDepartureShare)}{" "}
                          unannounced
                        </span>
                      )}
                      {" → "}
                    </span>
                  )}
                  <span className="font-semibold text-[var(--gray-700)]">
                    {formatBillions(micro.moverIncomeTaxB)}/yr
                  </span>{" "}
                  in lost CA income tax.
                </div>
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
                    <span>Gross wealth tax (with phase-in)</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(result.grossWealthTaxB)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span>After avoidance</span>
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

        <section className="space-y-4 border-t border-[var(--gray-200)] pt-10">
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--gray-700)]">
            Billionaire-level detail
          </h3>
          <div className="rounded-[28px] border border-[var(--gray-200)] bg-white p-5 shadow-[0_30px_80px_-48px_rgba(40,94,97,0.45)]">
            <BillionaireTable
              rows={micro.rows}
              avoidanceRate={params.avoidanceRate}
              excludeRealEstate={params.excludeRealEstate}
            />
          </div>
          <p className="text-xs leading-5 text-[var(--gray-400)]">
            Source:{" "}
            <a
              href="https://github.com/bjaros20/wealth_tax"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--teal-600)]"
            >
              Rauh et al. replication data
            </a>{" "}
            (Forbes Oct 2025 + news-reported real estate + departure status).
            Income tax from PolicyEngine.
          </p>
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
