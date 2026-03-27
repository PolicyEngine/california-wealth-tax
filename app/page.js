"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { calculateFiscalImpact } from "@/lib/calculator";
import { formatBillions } from "@/lib/format";
import { computeMicroResults, VALUATION_DATE } from "@/lib/microModel";
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
import rauhData from "@/data/billionaires_rauh.json";
import liveData from "@/data/billionaires_live.json";
import snapshotIndex from "@/public/snapshots/index.json";

const BillionaireTable = dynamic(
  () => import("@/app/components/BillionaireTable"),
  { loading: () => <ChartLoading /> }
);

const WEALTH_TAX_RATE = 0.05;
const CASH_FLOW_DISPLAY_YEARS = 30;

// CBO CPI-U forecast via PolicyEngine: ~2.45% annualized 2026–2030.
// Used to convert nominal wealth growth to real for PV discounting.
const INFLATION_RATE = 0.025;

// Bundled snapshots (always available without fetch)
const BUNDLED_SNAPSHOTS = {
  "2025-10-17": rauhData,
};
// Add live data under its date key
const LIVE_DATE = snapshotIndex[snapshotIndex.length - 1];
BUNDLED_SNAPSHOTS[LIVE_DATE] = liveData;

function deriveBaseOptions(snapshot) {
  const data = snapshot.data;
  const dateLabel = snapshot.date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
  const all = data;
  const stayers = data.filter((b) => !b.moved);
  const allWealth = all.reduce((s, b) => s + b.netWorth / 1e9, 0);
  const allRE = all.reduce((s, b) => s + (b.realEstate || 0) / 1e9, 0);
  const stayerWealth = stayers.reduce((s, b) => s + b.netWorth / 1e9, 0);
  const stayerRE = stayers.reduce((s, b) => s + (b.realEstate || 0) / 1e9, 0);
  const moverCount = all.length - stayers.length;

  return {
    all: {
      label: "All Forbes CA billionaires",
      wealthB: allWealth,
      realEstateB: allRE,
      description: `${all.length} billionaires, ${dateLabel} Forbes`,
    },
    afterDepartures: {
      label: "After known departures",
      wealthB: stayerWealth,
      realEstateB: stayerRE,
      description: `${stayers.length} billionaires (${moverCount} left CA)`,
    },
  };
}

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
      snapshotDate: "2025-10-17",
      wealthBase: "all",
      excludeRealEstate: false,
      avoidanceRate: 0.1,
      unannouncedDepartureShare: 0,
      wealthGrowthRate: 0,
      annualReturnRate: 0,
      incomeYieldRate: 0.01,
      horizonYears: Infinity,
      discountRate: 0.03,
    },
  },
  rauh: {
    label: "Rauh headline",
    description: "Calibrated to Rauh et al.'s revenue and net-cost headline.",
    href: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6340778",
    params: {
      snapshotDate: "2025-10-17",
      wealthBase: "afterDepartures",
      excludeRealEstate: true,
      avoidanceRate: 0.15,
      unannouncedDepartureShare: 0,
      wealthGrowthRate: 0,
      annualReturnRate: 0,
      incomeYieldRate: 0.042,
      horizonYears: Infinity,
      discountRate: 0.03,
    },
  },
};

const DEFAULT_PARAMS = {
  dataSnapshot: "rauh",
  wealthBase: "all",
  excludeRealEstate: false,
  avoidanceRate: 0.1,
  unannouncedDepartureShare: 0,
  wealthGrowthRate: 0,
  annualReturnRate: 0,
  incomeYieldRate: 0.01,
  inflationRate: 0,
  horizonYears: Infinity,
  discountRate: 0.03,
};


const formatPercent = (value, decimals = 0) =>
  `${(value * 100).toFixed(decimals)}%`;

const formatYears = (value) =>
  value === Infinity ? "Perpetuity" : `${value} years`;

function buildPresetDetails(params) {
  const data = BUNDLED_SNAPSHOTS[params.snapshotDate] ?? liveData;
  const sourceDate = new Date(params.snapshotDate + "T00:00:00");
  const micro = computeMicroResults({
    billionaires: data,
    incomeTaxLookup,
    wealthBase: params.wealthBase,
    excludeRealEstate: params.excludeRealEstate,
    incomeYieldRate: params.incomeYieldRate,
    wealthGrowthRate: params.wealthGrowthRate,
    unannouncedDepartureShare: params.unannouncedDepartureShare,
    sourceDate,
  });
  const result = calculateFiscalImpact({
    grossWealthTaxB: micro.grossWealthTaxB,
    avoidanceRate: params.avoidanceRate,
    moverIncomeTaxB: micro.moverIncomeTaxB,
    horizonYears: params.horizonYears,
    discountRate: params.discountRate,
    annualReturnRate: params.annualReturnRate,
    growthRate: params.wealthGrowthRate - INFLATION_RATE,
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

  const [snapshotData, setSnapshotData] = useState(
    BUNDLED_SNAPSHOTS[params.snapshotDate] ?? liveData
  );

  useEffect(() => {
    const date = params.snapshotDate;
    if (BUNDLED_SNAPSHOTS[date]) {
      setSnapshotData(BUNDLED_SNAPSHOTS[date]);
      return;
    }
    fetch(`/snapshots/${date}.json`)
      .then((r) => r.json())
      .then(setSnapshotData)
      .catch(() => setSnapshotData(liveData));
  }, [params.snapshotDate]);

  const sourceDate = useMemo(
    () => new Date(params.snapshotDate + "T00:00:00"),
    [params.snapshotDate]
  );
  const baseOptions = useMemo(
    () => deriveBaseOptions({ data: snapshotData, date: sourceDate }),
    [snapshotData, sourceDate]
  );

  const micro = useMemo(
    () =>
      computeMicroResults({
        billionaires: snapshotData,
        incomeTaxLookup,
        wealthBase: params.wealthBase,
        excludeRealEstate: params.excludeRealEstate,
        incomeYieldRate: params.incomeYieldRate,
        wealthGrowthRate: params.wealthGrowthRate,
        unannouncedDepartureShare: params.unannouncedDepartureShare,
        sourceDate,
      }),
    [snapshotData, sourceDate, params]
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
        growthRate: params.wealthGrowthRate,
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
                <div className="flex items-center gap-3 py-4">
                  <label className="text-sm font-semibold tracking-[-0.01em] text-[var(--gray-700)]">
                    Forbes snapshot
                  </label>
                  <select
                    value={params.snapshotDate}
                    onChange={(e) => update("snapshotDate", e.target.value)}
                    className="rounded-full border border-[var(--gray-300)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--gray-700)]"
                  >
                    {snapshotIndex.map((date) => (
                      <option key={date} value={date}>
                        {date}
                        {date === "2025-10-17" ? " (Saez/Rauh)" : ""}
                        {date === LIVE_DATE ? " (latest)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 py-4">
                  <p className="text-sm font-semibold tracking-[-0.01em] text-[var(--gray-700)]">
                    Who is included?
                  </p>
                  <div className="space-y-2">
                    {Object.entries(baseOptions).map(([key, option]) => (
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
                            ${option.wealthB.toLocaleString(undefined, { maximumFractionDigits: 0 })}B
                          </span>
                          <p className="text-xs text-[var(--gray-500)]">
                            {option.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="py-3">
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
                          baseOptions[params.wealthBase]?.realEstateB ?? 0
                        ).toFixed(1)}
                        B
                      </span>
                    </div>
                  </label>
                </div>

                <Slider
                  label="Avoidance / evasion"
                  value={params.avoidanceRate}
                  onChange={(nextValue) => update("avoidanceRate", nextValue)}
                  min={0}
                  max={0.5}
                  step={0.01}
                  format={(value) => formatPercent(value)}
                  quickPicks={[
                    { label: "5%", value: 0.05 },
                    { label: "10%", value: 0.1 },
                    { label: "15%", value: 0.15 },
                  ]}
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
                  quickPicks={[
                    { label: "0%", value: 0 },
                    { label: "5%", value: 0.05 },
                    { label: "10%", value: 0.1 },
                  ]}
                />

                <Slider
                  label="Nominal wealth growth"
                  value={params.wealthGrowthRate}
                  onChange={(nextValue) =>
                    update("wealthGrowthRate", nextValue)
                  }
                  min={0}
                  max={0.15}
                  step={0.005}
                  format={(value) => formatPercent(value, 1)}
                  quickPicks={[]}
                />

                <div className="flex items-center justify-between border-t border-[var(--gray-100)] py-4">
                  <span className="text-sm font-semibold text-[var(--gray-600)]">
                    Net wealth tax collected
                  </span>
                  <span className="text-sm font-semibold text-[var(--teal-700)]">
                    {formatBillions(result.wealthTaxCollected)}
                  </span>
                </div>
              </AssumptionSection>

              {(micro.movers.length > 0 || params.unannouncedDepartureShare > 0) && (
              <AssumptionSection title="Income tax loss from departures">
                <Slider
                  label="Share of leavers who return to CA per year"
                  value={params.annualReturnRate}
                  onChange={(nextValue) =>
                    update("annualReturnRate", nextValue)
                  }
                  min={0}
                  max={0.5}
                  step={0.01}
                  format={(value) => formatPercent(value)}
                  quickPicks={[
                    { label: "0%", value: 0 },
                    { label: "5%", value: 0.05 },
                    { label: "15%", value: 0.15 },
                  ]}
                />

                <Slider
                  label="Annual CA-taxable income / taxed wealth"
                  value={params.incomeYieldRate}
                  onChange={(nextValue) => update("incomeYieldRate", nextValue)}
                  min={0.005}
                  max={0.05}
                  step={0.001}
                  format={(value) => formatPercent(value, 1)}
                  quickPicks={[
                    { label: "1%", value: 0.01 },
                    { label: "2%", value: 0.02 },
                    { label: "3%", value: 0.03 },
                  ]}
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
                  quickPicks={[
                    { label: "10y", value: 10 },
                    { label: "30y", value: 30 },
                    { label: "Perpetuity", value: 100 },
                  ]}
                />

                <Slider
                  label="Real discount rate"
                  value={params.discountRate}
                  onChange={(nextValue) => update("discountRate", nextValue)}
                  min={0.01}
                  max={0.07}
                  step={0.005}
                  format={(value) => formatPercent(value, 1)}
                  quickPicks={[
                    { label: "2%", value: 0.02 },
                    { label: "3%", value: 0.03 },
                    { label: "5%", value: 0.05 },
                  ]}
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
            Wealth from Forbes. Departure status and real estate from{" "}
            <a
              href="https://github.com/bjaros20/wealth_tax"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--teal-600)]"
            >
              Rauh et al.
            </a>
            . CA income tax from{" "}
            <a
              href="https://github.com/PolicyEngine/policyengine-us"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--teal-600)]"
            >
              PolicyEngine
            </a>{" "}
            (MFJ, 2026–2030).
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
                Uses only the {PRESET_DETAILS.rauh.micro.stayers.length}{" "}
                billionaires who stayed through Dec 31, 2025
                (excluding {PRESET_DETAILS.rauh.micro.movers.length} known
                departures), excludes directly-held real estate, and
                applies {formatPercent(PRESETS.rauh.params.avoidanceRate)}{" "}
                avoidance. Net wealth tax collected:{" "}
                {formatBillions(PRESET_DETAILS.rauh.result.wealthTaxCollected)}.
              </p>
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                Income / wealth yield of{" "}
                {formatPercent(PRESETS.rauh.params.incomeYieldRate, 1)} is
                backed out by this app to match their ~-$25B net headline
                — Rauh et al. model income differently.{" "}
                {formatPercent(PRESETS.rauh.params.discountRate, 1)} real
                discount rate, {formatPercent(INFLATION_RATE, 1)} CBO
                inflation forecast, perpetuity horizon.
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-[var(--gray-500)]">
            Both presets are simplified calibrations, not full replications.
            Wealth growth is nominal; the real discount rate is adjusted by a{" "}
            {formatPercent(INFLATION_RATE, 1)} inflation assumption (CBO
            CPI-U forecast via PolicyEngine). CA income tax from
            PolicyEngine (married filing jointly, 2026–2030).
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
