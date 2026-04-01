"use client";

import { useState, useMemo } from "react";

/**
 * Wizard / survey-style entry flow for the California wealth tax calculator.
 *
 * Three paths:
 *   berkeley  — broad tax base, minimal behavioral response (4 steps)
 *   hoover    — narrower base with migration + PIT effects (5 steps)
 *   custom    — walk through everything (6 steps)
 *
 * On completion the wizard calls `onComplete(params)` with a fully-built
 * params object that the parent can feed straight into the calculator.
 */

// ── step definitions ──────────────────────────────────────────────────

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

// ── param builder ─────────────────────────────────────────────────────

function buildParams({
  path,
  snapshot,
  residencyExclusionIds,
  excludeRealEstate,
  avoidanceRate,
  unannouncedDepartureShare,
  includeIncomeTaxEffects,
  presets,
  liveDate,
  paperDate,
  defaultParams,
}) {
  // start from the preset that matches the chosen path
  const base =
    path === "berkeley"
      ? { ...presets.saez.params }
      : path === "hoover"
        ? { ...presets.rauh.params }
        : { ...defaultParams };

  // override snapshot
  base.snapshotDate = snapshot === "paper" ? paperDate : liveDate;

  // apply wizard-level overrides where the user changed them
  if (residencyExclusionIds !== undefined) {
    base.residencyExclusionIds = residencyExclusionIds;
  }
  if (excludeRealEstate !== undefined) {
    base.excludeRealEstate = excludeRealEstate;
  }
  if (avoidanceRate !== undefined) {
    base.avoidanceRate = avoidanceRate;
  }
  if (unannouncedDepartureShare !== undefined) {
    base.unannouncedDepartureShare = unannouncedDepartureShare;
  }
  if (includeIncomeTaxEffects !== undefined) {
    base.includeIncomeTaxEffects = includeIncomeTaxEffects;
  }

  return base;
}

// ── sub-components ────────────────────────────────────────────────────

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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--gray-400)]">
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--gray-100)]">
          <div
            className="h-full rounded-full bg-[var(--teal-600)] transition-all duration-300"
            style={{
              width: `${((stepIndex + 1) / totalSteps) * 100}%`,
            }}
          />
        </div>
      </div>
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--gray-700)]">
          {title}
        </h2>
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

// ── main wizard ───────────────────────────────────────────────────────

export default function Wizard({
  presets,
  defaultParams,
  liveDate,
  paperDate,
  residencyAdjustments,
  residencyOnlyExclusionIds,
  preSnapshotExclusionIds,
  normalizeResidencyExclusionIdsFn,
  onComplete,
  onSkip,
}) {
  const [step, setStep] = useState(0);

  // wizard answers
  const [path, setPath] = useState(null); // "berkeley" | "hoover" | "custom"
  const [snapshot, setSnapshot] = useState("current");
  const [residencyExclusions, setResidencyExclusions] = useState([]);
  const [avoidanceRate, setAvoidanceRate] = useState(0.1);
  const [departureShare, setDepartureShare] = useState(0);
  const [includeIncomeTax, setIncludeIncomeTax] = useState(false);

  const steps = useMemo(() => visibleSteps(path), [path]);
  const currentStep = steps[step];

  // when path changes, reset downstream defaults
  function choosePath(p) {
    setPath(p);
    if (p === "berkeley") {
      setResidencyExclusions([]);
      setAvoidanceRate(0.1);
      setDepartureShare(0);
      setIncludeIncomeTax(false);
    } else if (p === "hoover") {
      setResidencyExclusions(
        normalizeResidencyExclusionIdsFn([
          ...residencyOnlyExclusionIds,
          ...preSnapshotExclusionIds,
        ])
      );
      setAvoidanceRate(0);
      setDepartureShare(0.48);
      setIncludeIncomeTax(true);
    } else {
      setResidencyExclusions([]);
      setAvoidanceRate(0);
      setDepartureShare(0);
      setIncludeIncomeTax(false);
    }
  }

  function next() {
    if (step >= steps.length - 1) {
      finish();
      return;
    }
    setStep(step + 1);
  }

  function back() {
    if (step > 0) setStep(step - 1);
  }

  function finish() {
    const params = buildParams({
      path,
      snapshot,
      residencyExclusionIds: residencyExclusions,
      excludeRealEstate: path === "berkeley" ? false : true,
      avoidanceRate,
      unannouncedDepartureShare: departureShare,
      includeIncomeTaxEffects: includeIncomeTax,
      presets,
      liveDate,
      paperDate,
      defaultParams,
    });
    onComplete(params);
  }

  function toggleResidencyExclusion(id) {
    setResidencyExclusions((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  }

  const canAdvance =
    currentStep?.id === "path" ? path !== null : true;

  const isLastStep = step >= steps.length - 1;

  // ── render steps ──────────────────────────────────────────────────

  function renderStep() {
    if (!currentStep) return null;

    switch (currentStep.id) {
      case "path":
        return (
          <StepShell
            stepIndex={step}
            totalSteps={steps.length}
            title="Choose a starting point"
            subtitle="Each option uses different assumptions about the tax base and behavioral response."
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
            subtitle="The billionaire wealth base can use today's Forbes data or the October 2025 snapshot used in the academic papers."
          >
            <OptionCard
              selected={snapshot === "current"}
              onClick={() => setSnapshot("current")}
              title={`Current Forbes data (${liveDate})`}
              description="Uses the latest daily Forbes billionaire snapshot."
            />
            <OptionCard
              selected={snapshot === "paper"}
              onClick={() => setSnapshot("paper")}
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
            subtitle="Should any billionaires be excluded from the tax base based on contested residency or announced departures? Whether these establish a legal change of domicile is debated."
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
                  const excluded = residencyExclusions.includes(adj.id);
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
            subtitle="What share of the remaining tax base leaves California in response to the tax?"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--gray-700)]">
                  Additional departure share
                </span>
                <span className="text-sm font-semibold text-[var(--teal-700)]">
                  {(departureShare * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={departureShare}
                onChange={(e) => setDepartureShare(parseFloat(e.target.value))}
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
            subtitle="What share of the tax base is lost to avoidance, valuation disputes, or other non-migration factors?"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--gray-700)]">
                  Erosion rate
                </span>
                <span className="text-sm font-semibold text-[var(--teal-700)]">
                  {(avoidanceRate * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={avoidanceRate}
                onChange={(e) => setAvoidanceRate(parseFloat(e.target.value))}
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
            subtitle="Should the model include California income tax lost from billionaires who leave?"
          >
            <OptionCard
              selected={includeIncomeTax}
              onClick={() => setIncludeIncomeTax(true)}
              title="Include income tax effects"
              description="Models the present value of future California PIT lost from departing billionaires. This is a separate causality assumption."
            />
            <OptionCard
              selected={!includeIncomeTax}
              onClick={() => setIncludeIncomeTax(false)}
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
    <div className="mx-auto max-w-xl py-10">
      <div className="rounded-[28px] border border-[var(--gray-200)] bg-white p-8 shadow-[0_30px_80px_-48px_rgba(40,94,97,0.45)]">
        {renderStep()}

        <div className="mt-8 flex items-center justify-between">
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
              onClick={onSkip}
              className="text-sm font-medium text-[var(--gray-400)] transition-colors hover:text-[var(--teal-700)]"
            >
              Skip to advanced
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance}
              className={`rounded-full px-6 py-2.5 text-sm font-semibold transition-colors ${
                canAdvance
                  ? "bg-[var(--teal-700)] text-white hover:bg-[var(--teal-800)]"
                  : "cursor-not-allowed bg-[var(--gray-200)] text-[var(--gray-400)]"
              }`}
            >
              {isLastStep ? "See results" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
