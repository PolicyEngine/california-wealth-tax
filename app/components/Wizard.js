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
 *   berkeley  — broad tax base, minimal behavioral response (3 steps)
 *   hoover    — narrower base with migration + PIT effects (5 steps)
 *   custom    — walk through everything (6 steps)
 */

const STEPS = [
  { id: "path", showFor: () => true },
  { id: "snapshot", showFor: () => true },
  { id: "residency", showFor: (p) => p === "hoover" || p === "custom" },
  { id: "migration", showFor: (p) => p === "hoover" || p === "custom" },
  { id: "erosion", showFor: (p) => p === "berkeley" || p === "custom" },
  { id: "incomeTax", showFor: (p) => p === "hoover" || p === "custom" },
];

function visibleSteps(path) {
  return STEPS.filter((s) => s.showFor(path));
}

function OptionCard({ selected, onClick, title, description }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-5 py-4 text-left transition-colors ${
        selected
          ? "border-[var(--teal-600)] bg-[var(--teal-50)]"
          : "border-[var(--gray-200)] bg-white hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)]"
      }`}
    >
      <span className="text-sm font-semibold text-[var(--gray-700)]">
        {title}
      </span>
      {description && (
        <p className="mt-1 text-xs leading-5 text-[var(--gray-500)]">
          {description}
        </p>
      )}
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
  presets,
  liveDate,
  paperDate,
  residencyAdjustments,
  residencyOnlyExclusionIds,
  preSnapshotExclusionIds,
  normalizeResidencyExclusionIdsFn,
  toggleResidencyExclusion,
  onDone,
  onPathChange,
  onResetParams,
}) {
  const [step, setStep] = useState(0);
  const [path, setPath] = useState(null);
  const hasPath = path !== null;

  const steps = useMemo(() => visibleSteps(path), [path]);
  const currentStep = steps[step];
  const isLastStep = step >= steps.length - 1;
  const canAdvance = currentStep?.id === "path" ? path !== null : true;

  function choosePath(p) {
    setPath(p);
    // Berkeley/Hoover apply a preset immediately → show the number
    // Custom resets to defaults → don't show until they start adjusting
    if (p === "berkeley") {
      applyPreset("saez");
      update("snapshotDate", liveDate);
      onPathChange?.(true);
    } else if (p === "hoover") {
      applyPreset("rauh");
      update("snapshotDate", liveDate);
      onPathChange?.(true);
    } else {
      onResetParams?.();
      onPathChange?.(false);
    }
  }

  function next() {
    if (isLastStep) {
      onDone();
      return;
    }
    // Show the number once the custom user moves past the path step
    if (currentStep?.id === "path" && path === "custom") {
      onPathChange?.(true);
    }
    setStep(step + 1);
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  function renderStep() {
    if (!currentStep) return null;

    switch (currentStep.id) {
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
            />
            <OptionCard
              selected={path === "hoover"}
              onClick={() => choosePath("hoover")}
              title="Hoover (Rauh et al.)"
              description="Narrower base with residency adjustments, migration response, and future income tax effects."
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

      case "migration":
        return (
          <StepShell
            stepIndex={step}
            totalSteps={steps.length}
            title="Migration response"
            subtitle="Drag the slider and watch the estimate update."
          >
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
              Rauh et al. use ~48% based on a literature-calibrated elasticity.
              Saez/Galle use 0%. This is the share of billionaires who leave
              <em> beyond</em> any announced departures checked above.
            </p>
          </StepShell>
        );

      case "erosion":
        return (
          <StepShell
            stepIndex={step}
            totalSteps={steps.length}
            title="Non-migration erosion"
            subtitle="Drag the slider and watch the estimate update."
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
            subtitle="Toggle and watch the estimate change."
          >
            <OptionCard
              selected={params.includeIncomeTaxEffects}
              onClick={() => update("includeIncomeTaxEffects", true)}
              title="Include income tax effects"
              description="Models the present value of future California PIT lost from departing billionaires. This is a separate causality assumption."
            />
            <OptionCard
              selected={!params.includeIncomeTaxEffects}
              onClick={() => update("includeIncomeTaxEffects", false)}
              title="Wealth tax only"
              description="Reports only the one-time wealth-tax score, without modeling future income tax losses."
            />
          </StepShell>
        );

      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      {renderStep()}

      <div className="flex items-center justify-between pt-2">
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onDone}
            className="text-sm font-medium text-[var(--gray-400)] transition-colors hover:text-[var(--teal-700)]"
          >
            Show all controls
          </button>
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
            {isLastStep ? "Show all controls" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
