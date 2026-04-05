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
  { id: "pitToggle", showFor: (p) => p === "hoover" || p === "custom" },
  { id: "pitStream", showFor: (p, params) => (p === "hoover" || p === "custom") && params?.includeIncomeTaxEffects },
  { id: "pitValuation", showFor: (p, params) => (p === "hoover" || p === "custom") && params?.includeIncomeTaxEffects },
];

function visibleSteps(path, params) {
  return STEPS.filter((s) => s.showFor(path, params));
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

function formatBillions(value) {
  const decimals = Math.abs(value) >= 100 ? 0 : 1;
  return `$${value.toFixed(decimals)}B`;
}

export default function Wizard({
  params,
  update,
  applyPreset,
  additionalExcludedWealthB,
  additionalExcludedWealthMaxB,
  additionalExcludedWealthStepB,
  additionalExcludedWealthShare,
  observedDepartureWealthB,
  totalExcludedWealthB,
  totalExcludedWealthShare,
  impliedTotalMigrationElasticity,
  updateAdditionalExcludedWealthB,
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

  const steps = useMemo(() => visibleSteps(path, params), [path, params]);
  const clampedStep = Math.min(step, steps.length - 1);
  const currentStep = steps[clampedStep];
  const isLastStep = clampedStep >= steps.length - 1;
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
    setStep(clampedStep + 1);
  }

  function back() {
    if (clampedStep > 0) setStep(clampedStep - 1);
  }

  function renderStep() {
    if (!currentStep) return null;

    switch (currentStep.id) {
      case "intro":
        return (
          <StepShell
            stepIndex={clampedStep}
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
            stepIndex={clampedStep}
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
            stepIndex={clampedStep}
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
            stepIndex={clampedStep}
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
            stepIndex={clampedStep}
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
                  Annual nominal wealth growth
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
                Grows the Forbes snapshot to the December 31, 2026 valuation
                date and compounds the income tax loss projection beyond it.
              </p>
            </div>
          </StepShell>
        );

      case "migration":
        return (
          <StepShell
            stepIndex={clampedStep}
            totalSteps={steps.length}
            title="Migration response"
            subtitle="Estimate how much additional billionaire wealth ends up outside the tax base beyond the named cases above."
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--gray-700)]">
                  Additional wealth outside the tax base
                </span>
                <span className="text-sm font-semibold text-[var(--teal-700)]">
                  {formatBillions(additionalExcludedWealthB)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={additionalExcludedWealthMaxB}
                step={additionalExcludedWealthStepB}
                value={Math.min(additionalExcludedWealthB, additionalExcludedWealthMaxB)}
                onChange={(e) =>
                  updateAdditionalExcludedWealthB(parseFloat(e.target.value))
                }
                className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--gray-100)] accent-[var(--teal-600)]"
              />
              <div className="flex justify-between text-xs text-[var(--gray-400)]">
                <span>$0B</span>
                <span>{formatBillions(additionalExcludedWealthMaxB)}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--gray-200)] bg-white px-4 py-3 text-xs leading-5 text-[var(--gray-500)]">
              <p>
                Named cases above already remove{" "}
                <span className="font-semibold text-[var(--gray-700)]">
                  {formatBillions(observedDepartureWealthB)}
                </span>
                . Adding{" "}
                <span className="font-semibold text-[var(--gray-700)]">
                  {formatBillions(additionalExcludedWealthB)}
                </span>{" "}
                beyond those names puts{" "}
                <span className="font-semibold text-[var(--gray-700)]">
                  {formatBillions(totalExcludedWealthB)}
                </span>{" "}
                outside the tax base.
              </p>
              <p className="mt-2">
                That equals{" "}
                <span className="font-semibold text-[var(--gray-700)]">
                  {(additionalExcludedWealthShare * 100).toFixed(1)}%
                </span>{" "}
                of the remaining base,{" "}
                <span className="font-semibold text-[var(--gray-700)]">
                  {(totalExcludedWealthShare * 100).toFixed(1)}%
                </span>{" "}
                of the total corrected base, and an implied total semi-elasticity of{" "}
                <span className="font-semibold text-[var(--gray-700)]">
                  {Number.isFinite(impliedTotalMigrationElasticity)
                    ? impliedTotalMigrationElasticity.toFixed(1)
                    : "∞"}
                </span>
                .
              </p>
            </div>
          </StepShell>
        );

      case "erosion":
        return (
          <StepShell
            stepIndex={clampedStep}
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

      case "pitToggle":
        return (
          <StepShell
            stepIndex={clampedStep}
            totalSteps={steps.length}
            title="Include income tax effects?"
            subtitle="Should the estimate count future California income tax losses from migration?"
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
                      Attribution rate
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
                  <p className="text-xs leading-5 text-[var(--gray-500)]">
                    What share of mover income tax loss is caused by the tax
                    itself, versus moves that would have happened anyway?
                  </p>
                </div>
              </>
            )}
          </StepShell>
        );

      case "pitStream":
        return (
          <StepShell
            stepIndex={clampedStep}
            totalSteps={steps.length}
            title="Income stream assumptions"
            subtitle="How much California income tax is at stake from movers each year?"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--gray-700)]">
                  Income yield (% of taxed wealth)
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
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                Rauh et al. estimate $3.3B–$5.8B/yr in CA PIT from this
                cohort using FTB data. The 2% midpoint calibration is
                the default.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--gray-700)]">
                  Annual return rate
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
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                Share of departed billionaires who return to California
                each year, reducing the ongoing income tax loss.
              </p>
            </div>
          </StepShell>
        );

      case "pitValuation":
        return (
          <StepShell
            stepIndex={clampedStep}
            totalSteps={steps.length}
            title="Present value assumptions"
            subtitle="How should future income tax losses be valued today?"
          >
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
                  Discount rate
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
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                Real discount rate for computing the present value of
                future income tax losses. Rauh et al. use 1.5%–4.5%.
              </p>
            </div>
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
            {clampedStep > 0 && (
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
