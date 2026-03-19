"use client";

import { useState, useMemo } from "react";
import { calculateFiscalImpact } from "@/lib/calculator";
import WaterfallChart from "@/app/components/WaterfallChart";
import EffectiveRatesChart from "@/app/components/EffectiveRatesChart";
import TaxSharesTable from "@/app/components/TaxSharesTable";
import Slider from "@/app/components/Slider";

import taxShares from "@/data/tax_shares.json";
import effectiveRates from "@/data/effective_rates.json";
import progressivity from "@/data/progressivity.json";

const TABS = [
  { id: "calculator", label: "Fiscal impact calculator" },
  { id: "ltcg", label: "Capital gains analysis" },
];

const PRESETS = {
  saez: {
    label: "Saez et al.",
    avoidanceRate: 0.1,
    departureRate: 0,
    annualIncomeTaxB: 2.9,
    horizonYears: Infinity,
    discountRate: 0.03,
    returnRate: 0,
  },
  rauh: {
    label: "Rauh et al.",
    avoidanceRate: 0.15,
    departureRate: 0.3,
    annualIncomeTaxB: 4.3,
    horizonYears: Infinity,
    discountRate: 0.03,
    returnRate: 0,
  },
};

const DEFAULT_PARAMS = {
  avoidanceRate: 0.15,
  departureRate: 0.15,
  annualIncomeTaxB: 4.3,
  horizonYears: 30,
  discountRate: 0.03,
  returnRate: 0.25,
};

export default function Home() {
  const [activeTab, setActiveTab] = useState("calculator");
  const [params, setParams] = useState(DEFAULT_PARAMS);

  const result = useMemo(() => calculateFiscalImpact(params), [params]);

  function update(key, value) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(key) {
    setParams(PRESETS[key]);
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
          />
        )}
        {activeTab === "ltcg" && <LTCGTab />}
      </main>
    </div>
  );
}

function CalculatorTab({ params, result, update, applyPreset }) {
  return (
    <>
      <p className="text-[var(--gray-600)] mb-6">
        Explore how different assumptions about avoidance, migration, and income
        tax loss affect the net fiscal impact of California&apos;s proposed 5%
        billionaire wealth tax. Baseline wealth tax base is $94.2B (Rauh et al.
        corrected estimate).
      </p>

      {/* Preset buttons */}
      <div className="flex gap-3 mb-6">
        {Object.entries(PRESETS).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            className="px-4 py-2 rounded-md border border-[var(--gray-300)] text-sm font-medium hover:bg-[var(--gray-100)] transition-colors"
          >
            {preset.label} assumptions
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Controls */}
        <div className="space-y-5">
          <h2 className="text-lg font-semibold">Assumptions</h2>

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
            description="Fraction of departees who return within 5 years"
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
            description="How long departing billionaires stay away"
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
              <span>Annual income tax lost</span>
              <span className="font-medium">
                ${result.annualIncomeTaxLost.toFixed(1)}B/yr
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

function LTCGTab() {
  const ratio5m = taxShares.shares.find(
    (s) => s.threshold === 5_000_000
  )?.ratio;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-2">
          Why federal income tax shares understate CA billionaire contributions
        </h2>
        <p className="text-[var(--gray-600)] mb-4">
          California taxes long-term capital gains as ordinary income (up to
          13.3%), while the federal code gives LTCG a preferential rate (max
          23.8% vs 37% for wages). Since billionaire income is
          disproportionately LTCG, scaling a federal-derived ratio to CA
          understates their contribution. Saez et al. cite ~2.5% of CA income
          tax receipts as the billionaire share, derived from federal data. Our
          analysis suggests the true figure is closer to 3.5%.
        </p>
      </div>

      {/* CA/Fed ratio chart */}
      <div>
        <h3 className="text-base font-semibold mb-3">
          CA tax / federal tax ratio by income type
        </h3>
        <p className="text-sm text-[var(--gray-600)] mb-3">
          At $100M income, a wage earner pays 36% as much CA tax as federal tax.
          A capital gains earner pays 56% — because CA doesn&apos;t discount
          LTCG.
        </p>
        <EffectiveRatesChart data={effectiveRates} />
      </div>

      {/* Tax shares table */}
      <div>
        <h3 className="text-base font-semibold mb-3">
          Tax share by AGI threshold (CA filers, 2026)
        </h3>
        <p className="text-sm text-[var(--gray-600)] mb-3">
          Among CA filers with AGI above $5M, they pay{" "}
          {ratio5m ? `${ratio5m.toFixed(2)}x` : "more"} as much of CA state
          income tax as they do of federal income tax.
        </p>
        <TaxSharesTable data={taxShares} />
      </div>

      {/* Progressivity */}
      <div>
        <h3 className="text-base font-semibold mb-3">
          Is CA&apos;s income tax more progressive than federal?
        </h3>
        <p className="text-sm text-[var(--gray-600)]">
          Measuring progressivity as Gini reduction per dollar of revenue
          (stripping out refundable tax credits like EITC and CTC), CA&apos;s
          rate structure is{" "}
          <span className="font-semibold">
            {progressivity.progressivity_ratio.toFixed(2)}x
          </span>{" "}
          as progressive as the federal rate structure per dollar collected. The
          federal system achieves{" "}
          {progressivity.fed_gini_per_trillion.toFixed(4)} Gini points of
          reduction per $1T of revenue, while CA achieves{" "}
          {progressivity.state_gini_per_trillion.toFixed(4)}.
        </p>
      </div>

      {/* Sources */}
      <div className="border-t border-[var(--gray-300)] pt-4">
        <h3 className="text-sm font-semibold text-[var(--gray-700)] mb-2">
          Sources and methodology
        </h3>
        <ul className="text-xs text-[var(--gray-600)] space-y-1">
          <li>
            Tax shares computed using PolicyEngine&apos;s CA-calibrated enhanced
            CPS microsimulation (2026 tax year).
          </li>
          <li>
            Effective rates from individual PolicyEngine household simulations
            (single filer, CA, 2026).
          </li>
          <li>
            Progressivity measured as change in Gini coefficient when each tax
            is removed, normalized by revenue. Federal refundable credits (EITC,
            CTC) excluded to isolate rate structure progressivity.
          </li>
          <li>
            Replication notebook:{" "}
            <a
              href="https://gist.github.com/MaxGhenis/bbae835f25e3d07ce57b5e16b7ff170a"
              className="text-[var(--teal-600)] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub Gist
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
