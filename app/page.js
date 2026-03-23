"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { calculateFiscalImpact } from "@/lib/calculator";
import Slider from "@/app/components/Slider";
import {
  buildScenarioHref,
  parseActiveTab,
  parseScenarioParams,
} from "@/lib/scenarioUrl";

const TABS = [
  { id: "calculator", label: "Fiscal impact calculator" },
  { id: "ltcg", label: "Capital gains analysis" },
];
const DEFAULT_TAB = TABS[0].id;
const TAB_IDS = TABS.map((tab) => tab.id);

const PRESETS = {
  saez: {
    label: "Saez headline",
    description: "Calibrated to Saez et al.'s roughly $100B static score.",
    params: {
      baselineWealthTaxB: 109.5,
      avoidanceRate: 0.1,
      departureRate: 0,
      annualIncomeTaxB: 2.9,
      horizonYears: Infinity,
      discountRate: 0.03,
      returnRate: 0,
    },
  },
  rauh: {
    label: "Rauh headline",
    description: "Calibrated to Rauh et al.'s ~$40B revenue and -$24.7B net score.",
    params: {
      baselineWealthTaxB: 67.2,
      avoidanceRate: 0.15,
      departureRate: 0.3,
      annualIncomeTaxB: 6.47,
      horizonYears: Infinity,
      discountRate: 0.03,
      returnRate: 0,
    },
  },
};

const DEFAULT_PARAMS = {
  baselineWealthTaxB: 94.2,
  avoidanceRate: 0.15,
  departureRate: 0.15,
  annualIncomeTaxB: 4.3,
  horizonYears: 30,
  discountRate: 0.03,
  returnRate: 0.25,
};

function ChartLoading() {
  return (
    <div className="h-[300px] rounded-lg border border-[var(--gray-200)] bg-[var(--gray-50)] animate-pulse" />
  );
}

function SectionLoading() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-72 rounded bg-[var(--gray-100)] animate-pulse" />
      <div className="h-20 rounded bg-[var(--gray-50)] animate-pulse" />
      <ChartLoading />
    </div>
  );
}

const WaterfallChart = dynamic(() => import("@/app/components/WaterfallChart"), {
  loading: () => <ChartLoading />,
});

const LTCGTab = dynamic(() => import("@/app/components/LTCGTab"), {
  loading: () => <SectionLoading />,
});

export default function Home() {
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [hasSyncedUrlState, setHasSyncedUrlState] = useState(false);
  const [copyStatus, setCopyStatus] = useState("idle");

  const result = useMemo(() => calculateFiscalImpact(params), [params]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setActiveTab(parseActiveTab(searchParams, TAB_IDS, DEFAULT_TAB));
    setParams(parseScenarioParams(searchParams, DEFAULT_PARAMS));
    setHasSyncedUrlState(true);
  }, []);

  useEffect(() => {
    if (!hasSyncedUrlState) {
      return;
    }

    const nextHref = buildScenarioHref(
      window.location.pathname,
      activeTab,
      DEFAULT_TAB,
      params,
      DEFAULT_PARAMS
    );
    const currentHref = `${window.location.pathname}${window.location.search}`;

    if (nextHref !== currentHref) {
      window.history.replaceState(null, "", nextHref);
    }
  }, [activeTab, hasSyncedUrlState, params]);

  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }

    const timeout = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  function update(key, value) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(key) {
    setParams({ ...PRESETS[key].params });
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
      <header className="bg-[var(--teal-700)] text-white px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-xl font-bold">
            California wealth tax fiscal impact calculator
          </h1>
          <p className="text-sm text-teal-100 mt-1">
            Analyzing the proposed 5% one-time tax on billionaire wealth
          </p>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-[var(--gray-300)]">
        <div className="max-w-6xl mx-auto flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[var(--teal-600)] text-[var(--teal-700)]"
                  : "border-transparent text-[var(--gray-600)] hover:text-[var(--gray-700)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6">
        {activeTab === "calculator" && (
          <CalculatorTab
            params={params}
            result={result}
            update={update}
            applyPreset={applyPreset}
            copyScenarioLink={copyScenarioLink}
            copyStatus={copyStatus}
          />
        )}
        {activeTab === "ltcg" && <LTCGTab />}
      </main>
    </div>
  );
}

function CalculatorTab({
  params,
  result,
  update,
  applyPreset,
  copyScenarioLink,
  copyStatus,
}) {
  return (
    <>
      <p className="text-[var(--gray-600)] mb-6">
        Explore how different assumptions about baseline revenue, avoidance,
        migration, and income tax loss affect the net fiscal impact of
        California&apos;s proposed 5% billionaire wealth tax. The default baseline
        gross score is $94.2B (Rauh et al.&apos;s corrected estimate).
      </p>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-3 mb-2">
        {Object.entries(PRESETS).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            className="px-4 py-2 rounded-md border border-[var(--gray-300)] text-sm font-medium hover:bg-[var(--gray-100)] transition-colors"
            title={preset.description}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={copyScenarioLink}
          className="px-4 py-2 rounded-md border border-[var(--teal-200)] text-sm font-medium text-[var(--teal-700)] hover:bg-[var(--teal-50)] transition-colors"
        >
          {copyStatus === "idle" ? "Copy scenario link" : copyStatus}
        </button>
      </div>
      <p className="text-xs text-[var(--gray-500)] mb-6">
        These presets are calibrated to each paper&apos;s headline estimate within
        this simplified calculator. They are not full replications of the
        underlying methodologies, and the URL updates as you edit so you can
        share a scenario directly.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Controls */}
        <div className="space-y-5">
          <h2 className="text-lg font-semibold">Assumptions</h2>

          <Slider
            label="Baseline wealth tax score"
            value={params.baselineWealthTaxB}
            onChange={(v) => update("baselineWealthTaxB", v)}
            min={20}
            max={140}
            step={0.5}
            format={(v) => `$${v.toFixed(1)}B`}
            description="Gross one-time revenue before avoidance and departures"
          />

          <Slider
            label="Avoidance rate"
            value={params.avoidanceRate}
            onChange={(v) => update("avoidanceRate", v)}
            min={0}
            max={0.5}
            step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            description="Fraction of tax base lost to avoidance/evasion"
          />

          <Slider
            label="Departure rate"
            value={params.departureRate}
            onChange={(v) => update("departureRate", v)}
            min={0}
            max={0.6}
            step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            description="Fraction of billionaires who leave CA"
          />

          <Slider
            label="Return migration rate"
            value={params.returnRate}
            onChange={(v) => update("returnRate", v)}
            min={0}
            max={0.8}
            step={0.05}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            description="Fraction of departees who resume CA residence within 5 years"
          />

          <Slider
            label="Annual billionaire income tax"
            value={params.annualIncomeTaxB}
            onChange={(v) => update("annualIncomeTaxB", v)}
            min={1}
            max={8}
            step={0.1}
            format={(v) => `$${v.toFixed(1)}B`}
            description="CA income tax paid by billionaires per year"
          />

          <Slider
            label="Income tax horizon"
            value={
              params.horizonYears === Infinity ? 100 : params.horizonYears
            }
            onChange={(v) => update("horizonYears", v >= 100 ? Infinity : v)}
            min={5}
            max={100}
            step={5}
            format={(v) => (v >= 100 ? "Perpetuity" : `${v} years`)}
            description="How long non-returning departees stay away"
          />

          <Slider
            label="Real discount rate"
            value={params.discountRate}
            onChange={(v) => update("discountRate", v)}
            min={0.01}
            max={0.07}
            step={0.005}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            description="Rate for discounting future income tax loss"
          />
        </div>

        {/* Results */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Net fiscal impact</h2>

          <div
            className={`text-4xl font-bold mb-6 ${
              result.netFiscalImpact >= 0
                ? "text-[var(--teal-600)]"
                : "text-[var(--red-600)]"
            }`}
          >
            {result.netFiscalImpact >= 0 ? "+" : ""}$
            {Math.abs(result.netFiscalImpact).toFixed(1)}B
          </div>

          <WaterfallChart waterfall={result.waterfall} />

          <div className="mt-6 space-y-2 text-sm text-[var(--gray-600)]">
            <div className="flex justify-between">
              <span>Wealth tax collected</span>
              <span className="font-medium">
                ${result.wealthTaxCollected.toFixed(1)}B
              </span>
            </div>
            <div className="flex justify-between">
              <span>Initial annual income tax lost</span>
              <span className="font-medium">
                ${result.annualIncomeTaxLost.toFixed(1)}B/yr
              </span>
            </div>
            <div className="flex justify-between">
              <span>PV of permanent income tax loss</span>
              <span className="font-medium">
                ${result.pvPermanentIncomeTaxLoss.toFixed(1)}B
              </span>
            </div>
            <div className="flex justify-between">
              <span>PV of return-migration loss</span>
              <span className="font-medium">
                ${result.pvTemporaryIncomeTaxLoss.toFixed(1)}B
              </span>
            </div>
            <div className="flex justify-between">
              <span>PV of lost income tax</span>
              <span className="font-medium">
                ${result.pvLostIncomeTax.toFixed(1)}B
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
