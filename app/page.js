"use client";

import { useState, useMemo } from "react";
import { calculateFiscalImpact } from "@/lib/calculator";
import WaterfallChart from "@/app/components/WaterfallChart";
import Slider from "@/app/components/Slider";

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
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <h1 className="text-xl font-bold">
            California wealth tax fiscal impact calculator
          </h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <p className="text-[var(--gray-600)] mb-6">
          Explore how different assumptions about avoidance, migration, and
          income tax loss affect the net fiscal impact of California&apos;s
          proposed 5% billionaire wealth tax. Baseline wealth tax base is $94.2B
          (Rauh et al. corrected estimate).
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
              value={params.horizonYears === Infinity ? 100 : params.horizonYears}
              onChange={(v) => update("horizonYears", v >= 100 ? Infinity : v)}
              min={5}
              max={100}
              step={5}
              format={(v) =>
                v >= 100 ? "Perpetuity" : `${v} years`
              }
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
      </main>
    </div>
  );
}
