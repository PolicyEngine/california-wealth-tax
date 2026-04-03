"use client";

import { useState, useMemo } from "react";

/**
 * Inline guided wizard for the California wealth tax calculator.
 *
 * Renders as the left column inside the existing two-column layout so the
 * results sidebar stays visible and updates in real time as users adjust
 * assumptions. Each wizard step maps to a group of calculator params that
 * the parent's `update()` function applies immediately.
 *
 * Three paths:
 *   berkeley  — broad tax base, minimal behavioral response
 *   hoover    — narrower base with migration + PIT effects
 *   custom    — walk through the main assumptions explicitly
 */

const STEPS = [
  { id: "intro", showFor: () => true },
  { id: "path", showFor: () => true },
  { id: "snapshot", showFor: () => true },
  { id: "residency", showFor: (p) => p === "hoover" || p === "custom" },
  { id: "mechanics", showFor: () => true },
  { id: "migration", showFor: (p) => p === "hoover" || p === "custom" },
  { id: "erosion", showFor: (p) => p === "berkeley" || p === "custom" },
  { id: "incomeTax", showFor: (p) => p === "hoover" || p === "custom" },
];

function visibleSteps(path) {
  return STEPS.filter((s) => s.showFor(path));
}

function ExternalLinkIcon({ className = "h-3 w-3" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
    >
      <path
        d="M11.25 3.75H16.25V8.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.75 11.25L16.25 3.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.25 11.25V13.75C16.25 15.1307 15.1307 16.25 13.75 16.25H6.25C4.86929 16.25 3.75 15.1307 3.75 13.75V6.25C3.75 4.86929 4.86929 3.75 6.25 3.75H8.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OptionCard({ selected, onClick, title, description, href }) {
  return (
    <div
      className={`w-full rounded-2xl border px-5 py-4 text-left transition-colors ${
        selected
          ? "border-[var(--teal-600)] bg-[var(--teal-50)]"
          : "border-[var(--gray-200)] bg-white hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)]"
      }`}
    >
      <button type="button" onClick={onClick} className="w-full text-left">
        <span className="text-sm font-semibold text-[var(--gray-700)]">
          {title}
        </span>
        {description && (
          <p className="mt-1 text-xs leading-5 text-[var(--gray-500)]">
            {description}
          </p>
        )}
      </button>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--teal-700)] hover:text-[var(--teal-800)]"
        >
          Read paper
          <ExternalLinkIcon />
        </a>
      )}
    </div>
  );
}

function ToggleChip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
        selected
          ? "border-[var(--teal-600)] bg-[var(--teal-700)] text-white"
          : "border-[var(--gray-300)] bg-white text-[var(--gray-700)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
      }`}
    >
      {children}
    </button>
  );
}

function StepShell({ stepIndex, totalSteps, title, subtitle, children }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--gray-400)]">
          {stepIndex + 1} / {totalSteps}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--gray-100)]">
          <div
            className="h-full rounded-full bg-[var(--teal-600)] transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>
      <div>
        <h4 className="text-lg font-semibold tracking-[-0.02em] text-[var(--gray-700)]">
          {title}
        </h4>
        {subtitle && (
          <p className="mt-1 text-sm leading-6 text-[var(--gray-500)]">
            {subtitle}
          </p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function Wizard({
  params,
  update,
  applyPreset,
  initialPath,
  liveDate,
  paperDate,
  ballotMeasureUrl,
  berkeleyPaperUrl,
  hooverPaperUrl,
  customSnapshotDate,
  snapshotDateMin,
  snapshotDateMax,
  resolveSnapshotDate,
  residencyAdjustments,
  toggleResidencyExclusion,
  onDone,
  onPathChange,
  onResetParams,
}) {
  const [step, setStep] = useState(0);
  const [path, setPath] = useState(initialPath ?? null);
  const hasPath = path !== null;

  const steps = useMemo(() => visibleSteps(path), [path]);
  const currentStep = steps[step];
  const isLastStep = step >= steps.length - 1;
  const canAdvance = currentStep?.id === "path" ? path !== null : true;

  function choosePath(p) {
    setPath(p);
    // Berkeley/Hoover apply their named paper scenarios immediately.
    // Custom resets to defaults and does not show a result until the user
    // moves past the opening step.
    if (p === "berkeley") {
      applyPreset("saez");
      onPathChange?.({ path: "berkeley", showResult: true });
    } else if (p === "hoover") {
      applyPreset("rauh");
      onPathChange?.({ path: "hoover", showResult: true });
    } else {
      onResetParams?.();
      onPathChange?.({ path: "custom", showResult: false });
    }
  }

  function next() {
    if (isLastStep) {
      onDone();
      return;
    }
    // Show the number once the custom user moves past the path step
    if (currentStep?.id === "path" && path === "custom") {
      onPathChange?.({ path: "custom", showResult: true });
    }
    setStep(step + 1);
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  function renderStep() {
    if (!currentStep) return null;

    switch (currentStep.id) {
      case "intro":
        return (
          <StepShell
            stepIndex={step}
            totalSteps={steps.length}
            title="What the ballot measure does"
            subtitle="This wizard first scores the one-time wealth tax, then optionally adds future California income tax effects."
          >
            <div className="rounded-2xl border border-[var(--gray-200)] bg-white px-5 py-4 text-sm leading-6 text-[var(--gray-600)]">
              <p>
                The measure would impose a one-time 5% tax on net worth above
                $1 billion for California residents as of January 1, 2026.
                Wealth is measured on December 31, 2026.
              </p>
              <p className="mt-3">
                It phases in from 0% at $1.0 billion to 5% at $1.1 billion,
                excludes directly held real property from net worth, and lets
                taxpayers either pay with the 2026 return or in five annual
                installments with a 7.5% nondeductible deferral charge.
              </p>
            </div>
            <a
              href={ballotMeasureUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gray-300)] bg-white px-4 py-2 text-sm font-medium text-[var(--gray-700)] transition-colors hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
            >
              Ballot measure text
              <ExternalLinkIcon className="h-3.5 w-3.5 opacity-70" />
            </a>
          </StepShell>
        );

      case "path":
        return (
          <StepShell
            stepIndex={step}
            totalSteps={steps.length}
            title="Choose a starting point"
            subtitle="Each option uses different assumptions. The estimate updates live as you adjust."
          >
            <OptionCard
              selected={path === "berkeley"}
              onClick={() => choosePath("berkeley")}
              title="Berkeley (Saez et al.)"
              description="Broad tax base, 10% avoidance haircut, no migration modeling. Closest to the ~$100B headline."
              href={berkeleyPaperUrl}
            />
            <OptionCard
              selected={path === "hoover"}
              onClick={() => choosePath("hoover")}
              title="Hoover (Rauh et al.)"
              description="Narrower base with residency adjustments, migration response, and future income tax effects."
              href={hooverPaperUrl}
            />
            <OptionCard
              selected={path === "custom"}
              onClick={() => choosePath("custom")}
              title="Custom"
              description="Walk through each assumption and set your own values."
            />
          </StepShell>
        );

      case "snapshot":
        return (
          <StepShell
            stepIndex={step}
            totalSteps={steps.length}
            title="Which wealth data?"
            subtitle="The estimate updates with each choice."
          >
            <OptionCard
              selected={params.snapshotDate === liveDate}
              onClick={() => update("snapshotDate", liveDate)}
              title={`Current Forbes data (${liveDate})`}
              description="Uses the latest daily Forbes billionaire snapshot."
            />
            <OptionCard
              selected={params.snapshotDate === paperDate}
              onClick={() => update("snapshotDate", paperDate)}
              title="Paper snapshot (2025-10-17)"
              description="Matches the Forbes data used in Saez and Rauh papers, for replication."
            />
            <OptionCard
              selected={
                params.snapshotDate !== liveDate &&
                params.snapshotDate !== paperDate
              }
              onClick={() =>
                update(
                  "snapshotDate",
                  params.snapshotDate !== liveDate &&
                    params.snapshotDate !== paperDate
                    ? params.snapshotDate
                    : customSnapshotDate
                )
              }
              title="Other stored snapshot"
              description="Pick any stored Forbes snapshot date."
            />
            {params.snapshotDate !== liveDate &&
              params.snapshotDate !== paperDate && (
                <div className="space-y-2 rounded-2xl border border-[var(--gray-200)] bg-white px-4 py-3">
                  <input
                    type="date"
                    value={params.snapshotDate}
                    min={snapshotDateMin}
                    max={snapshotDateMax}
                    onChange={(e) =>
                      update(
                        "snapshotDate",
                        resolveSnapshotDate(e.target.value)
                      )
                    }
                    className="rounded-full border border-[var(--gray-300)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--gray-700)]"
                  />
                  <p className="text-xs leading-5 text-[var(--gray-500)]">
                    Loads the nearest stored daily snapshot on or before the
                    selected date.
                  </p>
                </div>
              )}
          </StepShell>
        );

      case "residency":
        return (
          <StepShell
            stepIndex={step}
            totalSteps={steps.length}
            title="Residency adjustments"
            subtitle="Toggle names to see the estimate change. Whether these establish a legal change of domicile is debated."
          >
            {[
              {
                key: "residency",
                title: "Contested residency",
                items: residencyAdjustments.filter(
                  (a) => a.category === "residency"
                ),
              },
              {
                key: "pre_snapshot_departure",
                title: "Announced departures",
                items: residencyAdjustments.filter(
                  (a) => a.category === "pre_snapshot_departure"
                ),
              },
            ].map((group) => (
              <div key={group.key} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-500)]">
                  {group.title}
                </p>
                {group.items.map((adj) => {
                  const excluded = params.residencyExclusionIds.includes(adj.id);
                  return (
                    <div
                      key={adj.id}
                      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                        excluded
                          ? "border-[var(--teal-600)] bg-[var(--teal-50)]"
                          : "border-[var(--gray-200)] bg-white"
                      }`}
                    >
                      <span className="text-sm font-semibold text-[var(--gray-700)]">
                        {adj.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleResidencyExclusion(adj.id)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          !excluded
                            ? "border-[var(--teal-600)] bg-[var(--teal-700)] text-white"
                            : "border-[var(--gray-300)] bg-white text-[var(--gray-600)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                        }`}
                      >
                        {excluded ? "Excluded" : "Included"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            <p className="text-xs leading-5 text-[var(--gray-500)]">
              Default includes all. Galle et al. argue none should be excluded;
              Rauh &amp; Jaros exclude the full list.
            </p>
          </StepShell>
        );

      case "mechanics":
        return (
          <StepShell
            stepIndex={step}
            totalSteps={steps.length}
            title="Stage 1 mechanics"
            subtitle="These assumptions affect the one-time wealth-tax score directly."
          >
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[var(--gray-700)]">
                Directly-held real estate
              </p>
              <div className="flex flex-wrap gap-2">
                <ToggleChip
                  selected={params.excludeRealEstate}
                  onClick={() => update("excludeRealEstate", true)}
                >
                  Exclude it
                </ToggleChip>
                <ToggleChip
                  selected={!params.excludeRealEstate}
                  onClick={() => update("excludeRealEstate", false)}
                >
                  Include it
                </ToggleChip>
              </div>
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                The ballot text excludes directly held real property from net
                worth. Leaving it in gets you closer to the Berkeley-style
                paper headline.
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-[var(--gray-700)]">
                Wealth-tax payment timing
              </p>
              <div className="flex flex-wrap gap-2">
                <ToggleChip
                  selected={
                    params.wealthTaxPaymentMode === "lumpSum"
                  }
                  onClick={() => update("wealthTaxPaymentMode", "lumpSum")}
                >
                  Lump sum
                </ToggleChip>
                <ToggleChip
                  selected={
                    params.wealthTaxPaymentMode === "installments"
                  }
                  onClick={() =>
                    update("wealthTaxPaymentMode", "installments")
                  }
                >
                  5 installments
                </ToggleChip>
              </div>
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                Installments follow the initiative’s five-payment schedule with
                a 7.5% nondeductible deferral charge on the remaining balance.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--gray-700)]">
                  Nominal wealth growth to the tax date
                </span>
                <span className="text-sm font-semibold text-[var(--teal-700)]">
                  {(params.wealthGrowthRate * 100).toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.15}
                step={0.005}
                value={params.wealthGrowthRate}
                onChange={(e) =>
                  update("wealthGrowthRate", parseFloat(e.target.value))
                }
                className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--gray-100)] accent-[var(--teal-600)]"
              />
              <div className="flex justify-between text-xs text-[var(--gray-400)]">
                <span>0%</span>
                <span>15%</span>
              </div>
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                This grows the selected Forbes wealth snapshot forward to the
                December 31, 2026 valuation date used in the measure.
              </p>
            </div>
          </StepShell>
        );

      case "migration":
        return (
          <StepShell
            stepIndex={step}
            totalSteps={steps.length}
            title="Migration response"
            subtitle="Choose how much additional migration response to model."
          >
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[var(--gray-700)]">
                Modeling approach
              </p>
              <div className="flex flex-wrap gap-2">
                <ToggleChip
                  selected={params.departureResponseMode === "share"}
                  onClick={() => update("departureResponseMode", "share")}
                >
                  % of remaining base
                </ToggleChip>
                <ToggleChip
                  selected={params.departureResponseMode === "elasticity"}
                  onClick={() => update("departureResponseMode", "elasticity")}
                >
                  Elasticity
                </ToggleChip>
              </div>
            </div>

            {params.departureResponseMode === "elasticity" ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--gray-700)]">
                      Overall migration semi-elasticity
                    </span>
                    <span className="text-sm font-semibold text-[var(--teal-700)]">
                      {params.migrationSemiElasticity.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={0.1}
                    value={params.migrationSemiElasticity}
                    onChange={(e) =>
                      update(
                        "migrationSemiElasticity",
                        parseFloat(e.target.value)
                      )
                    }
                    className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--gray-100)] accent-[var(--teal-600)]"
                  />
                  <div className="flex justify-between text-xs text-[var(--gray-400)]">
                    <span>0</span>
                    <span>20</span>
                  </div>
                </div>
                <p className="text-xs leading-5 text-[var(--gray-500)]">
                  Rauh et al. use 12.6 via a literature-based linear
                  conversion. The calculator translates that into a loss share
                  from the remaining base after any announced departures above.
                </p>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--gray-700)]">
                      Additional departure share
                    </span>
                    <span className="text-sm font-semibold text-[var(--teal-700)]">
                      {(params.unannouncedDepartureShare * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={params.unannouncedDepartureShare}
                    onChange={(e) =>
                      update("unannouncedDepartureShare", parseFloat(e.target.value))
                    }
                    className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--gray-100)] accent-[var(--teal-600)]"
                  />
                  <div className="flex justify-between text-xs text-[var(--gray-400)]">
                    <span>0% (no additional departures)</span>
                    <span>100%</span>
                  </div>
                </div>
                <p className="text-xs leading-5 text-[var(--gray-500)]">
                  This is the share of billionaires who leave <em>beyond</em> any
                  announced departures checked above. Rauh et al. use roughly 48%
                  of the remaining base under their preferred calibration;
                  Saez/Galle use 0%.
                </p>
              </>
            )}
          </StepShell>
        );

      case "erosion":
        return (
          <StepShell
            stepIndex={step}
            totalSteps={steps.length}
            title="Non-migration erosion"
            subtitle="Choose how much non-migration erosion to apply."
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--gray-700)]">
                  Erosion rate
                </span>
                <span className="text-sm font-semibold text-[var(--teal-700)]">
                  {(params.avoidanceRate * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={params.avoidanceRate}
                onChange={(e) =>
                  update("avoidanceRate", parseFloat(e.target.value))
                }
                className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--gray-100)] accent-[var(--teal-600)]"
              />
              <div className="flex justify-between text-xs text-[var(--gray-400)]">
                <span>0%</span>
                <span>50%</span>
              </div>
            </div>
            <p className="text-xs leading-5 text-[var(--gray-500)]">
              Saez et al. apply a 10% haircut. This reduces one-time
              wealth-tax collections only; it does not model migration or
              future income tax effects.
            </p>
          </StepShell>
        );

      case "incomeTax":
        return (
          <StepShell
            stepIndex={step}
            totalSteps={steps.length}
            title="Future income tax effects"
            subtitle="These assumptions are separate from the one-time wealth-tax score."
          >
            <div className="flex flex-wrap gap-2">
              <ToggleChip
                selected={params.includeIncomeTaxEffects}
                onClick={() => update("includeIncomeTaxEffects", true)}
              >
                Include PIT effects
              </ToggleChip>
              <ToggleChip
                selected={!params.includeIncomeTaxEffects}
                onClick={() => update("includeIncomeTaxEffects", false)}
              >
                Wealth tax only
              </ToggleChip>
            </div>

            {!params.includeIncomeTaxEffects ? (
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                Reports only the one-time wealth-tax score, without modeling
                future California income-tax losses.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--gray-700)]">
                      Share of mover PIT loss attributed to the tax
                    </span>
                    <span className="text-sm font-semibold text-[var(--teal-700)]">
                      {(params.incomeTaxAttributionRate * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={params.incomeTaxAttributionRate}
                    onChange={(e) =>
                      update(
                        "incomeTaxAttributionRate",
                        parseFloat(e.target.value)
                      )
                    }
                    className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--gray-100)] accent-[var(--teal-600)]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--gray-700)]">
                      Annual CA-taxable income / taxed wealth
                    </span>
                    <span className="text-sm font-semibold text-[var(--teal-700)]">
                      {(params.incomeYieldRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.005}
                    max={0.05}
                    step={0.001}
                    value={params.incomeYieldRate}
                    onChange={(e) =>
                      update("incomeYieldRate", parseFloat(e.target.value))
                    }
                    className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--gray-100)] accent-[var(--teal-600)]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--gray-700)]">
                      Share of remaining leavers who return each year
                    </span>
                    <span className="text-sm font-semibold text-[var(--teal-700)]">
                      {(params.annualReturnRate * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.01}
                    value={params.annualReturnRate}
                    onChange={(e) =>
                      update("annualReturnRate", parseFloat(e.target.value))
                    }
                    className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--gray-100)] accent-[var(--teal-600)]"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--gray-700)]">
                      Income tax horizon
                    </span>
                    <span className="text-sm font-semibold text-[var(--teal-700)]">
                      {params.horizonYears === Infinity
                        ? "Perpetuity"
                        : `${params.horizonYears} years`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={5}
                    value={
                      params.horizonYears === Infinity
                        ? 100
                        : params.horizonYears
                    }
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      update("horizonYears", value >= 100 ? Infinity : value);
                    }}
                    className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--gray-100)] accent-[var(--teal-600)]"
                  />
                  <div className="flex justify-between text-xs text-[var(--gray-400)]">
                    <span>5 years</span>
                    <span>100 = perpetuity</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--gray-700)]">
                      Real discount rate
                    </span>
                    <span className="text-sm font-semibold text-[var(--teal-700)]">
                      {(params.discountRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.05}
                    step={0.005}
                    value={params.discountRate}
                    onChange={(e) =>
                      update("discountRate", parseFloat(e.target.value))
                    }
                    className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--gray-100)] accent-[var(--teal-600)]"
                  />
                </div>

                <p className="text-xs leading-5 text-[var(--gray-500)]">
                  This stage models attributed future California PIT loss from
                  movers. It is a separate causality layer on top of the
                  one-time wealth-tax score, not part of the statutory tax
                  itself.
                </p>
              </>
            )}
          </StepShell>
        );

      default:
        return null;
    }
  }

  return (
    <div className="space-y-6 pb-28">
      {renderStep()}

      <div className="sticky bottom-0 z-20 -mx-3 border-t border-[var(--gray-200)] bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                className="rounded-full border border-[var(--gray-300)] bg-white px-5 py-2.5 text-sm font-medium text-[var(--gray-700)] transition-colors hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
              >
                Back
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance}
            className={`rounded-full px-6 py-2.5 text-sm font-semibold transition-colors ${
              canAdvance
                ? "bg-[var(--teal-700)] text-white hover:bg-[var(--teal-600)]"
                : "cursor-not-allowed bg-[var(--gray-200)] text-[var(--gray-400)]"
            }`}
          >
            {isLastStep ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
