"use client";

import { useEffect, useRef } from "react";

import { StartFrom } from "@/app/components/ResultStrip";
import WaterfallChart from "@/app/components/WaterfallChart";
import { formatBillions, longDate } from "@/lib/format";

export const BRIDGE_ENDPOINTS = {
  baseline: "Statutory score, no behavior",
  berkeley: "Berkeley assumptions",
  hoover: "Hoover assumptions",
  your: "Your scenario",
};

const STEPS = [
  {
    key: "compare",
    title: "1. Why the estimates differ",
    note: "Berkeley and Hoover, assumption by assumption.",
  },
  {
    key: "build",
    title: "2. Build your own",
    note: "Pick a starting point and change what you disagree with.",
  },
];

// Clears the site header when a step or an opened assumption scrolls into view.
const HEADER_CLEARANCE_PX = 88;

export function StepTabs({ step, onChange }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {STEPS.map(({ key, title, note }) => {
        const isCurrent = step === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isCurrent}
            className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
              isCurrent
                ? "border-[var(--teal-600)] bg-[var(--teal-50)]"
                : "border-[var(--gray-200)] bg-white hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)]"
            }`}
          >
            <span className="block text-sm font-semibold text-[var(--gray-700)]">{title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-[var(--gray-500)]">{note}</span>
          </button>
        );
      })}
    </div>
  );
}

function EndpointSelect({ value, onChange, exclude, id, label }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-[var(--gray-600)]">
      <span className="sr-only">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-full border border-[var(--gray-300)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--gray-700)]"
      >
        {Object.entries(BRIDGE_ENDPOINTS)
          .filter(([key]) => key !== exclude && key !== "your")
          .map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
      </select>
    </label>
  );
}

function UnboundedNote() {
  return (
    <p className="rounded-2xl border border-dashed border-[var(--gray-300)] px-5 py-6 text-sm text-[var(--gray-500)]">
      One of these scenarios has an unbounded present value: the lost
      income-tax stream grows at least as fast as it is discounted and
      movers return. Shorten the horizon, lower the growth rate, or raise
      the discount rate to bridge them.
    </p>
  );
}

function StepValue({ value }) {
  return (
    <span
      className={`shrink-0 text-sm font-semibold tabular-nums ${
        value >= 0 ? "text-[var(--teal-700)]" : "text-[var(--red-600)]"
      }`}
    >
      {formatBillions(value, { showPlus: true })}
    </span>
  );
}

function waterfallSteps(bridge, startLabel) {
  return [
    { id: "start", label: startLabel, value: bridge.startValue },
    ...bridge.contributions.map((step) => ({
      id: step.id,
      label: step.shortLabel,
      value: step.value,
    })),
  ];
}

export function CompareStep({
  bridge,
  from,
  to,
  onChangeFrom,
  onChangeTo,
  hasEdits,
  campValues,
  onStartFrom,
  onOpenAssumption,
  onResumeScenario,
  stepDetails,
  referenceLines,
  snapshotDate,
  dataControl,
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
            {from === "berkeley" && to === "hoover"
              ? "What separates the published estimates"
              : "What each assumption is worth"}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--gray-600)]">
            <span>From</span>
            <EndpointSelect id="bridge-from" label="Bridge from" value={from} onChange={onChangeFrom} exclude={to} />
            <span>to</span>
            <EndpointSelect id="bridge-to" label="Bridge to" value={to} onChange={onChangeTo} exclude={from} />
          </div>
        </div>
        <p className="text-sm leading-6 text-[var(--gray-500)]">
          <span className="font-medium text-[var(--gray-700)]">
            {BRIDGE_ENDPOINTS[from]} {formatBillions(bridge.startValue, { showPlus: true })}
            {" \u2192 "}
            {BRIDGE_ENDPOINTS[to]} {formatBillions(bridge.endValue, { showPlus: true })}
          </span>
          , on the same people, Forbes data as of {longDate(snapshotDate)}, net present
          value as of 2026. Each bar is one assumption&apos;s worth, averaged
          over every order the assumptions could be applied in, so the bars sum
          exactly to the gap.
          <span className="max-[640px]:hidden"> Hover over a bar to see what it compares.</span>
        </p>
      </div>

      {bridge.finite === false ? (
        <UnboundedNote />
      ) : bridge.contributions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--gray-300)] px-5 py-6 text-sm text-[var(--gray-500)]">
          {BRIDGE_ENDPOINTS[from]} and {BRIDGE_ENDPOINTS[to]} share every
          assumption that matters here, so there is nothing to bridge: both
          give {formatBillions(bridge.startValue, { showPlus: true })}. Pick
          different endpoints.
        </p>
      ) : (
        <>
          <WaterfallChart
            waterfall={waterfallSteps(bridge, BRIDGE_ENDPOINTS[from])}
            totalLabel={BRIDGE_ENDPOINTS[to]}
            height={380}
            onBarClick={onOpenAssumption}
            clickableIds={new Set(bridge.contributions.map((step) => step.id))}
            referenceLines={referenceLines}
            stepDetails={stepDetails}
            clickHint={
              hasEdits
                ? "Click to change it in your scenario"
                : `Click to change it, starting from ${BRIDGE_ENDPOINTS[to]}`
            }
          />
          {/* A phone has no hover and no room for bar labels. */}
          <div className="divide-y divide-[var(--gray-200)] overflow-hidden rounded-2xl border border-[var(--gray-200)] min-[641px]:hidden">
            {bridge.contributions.map((step) => (
              <button
                key={step.id}
                type="button"
                onClick={() => onOpenAssumption(step.id)}
                className="flex w-full items-center gap-3 bg-white px-4 py-2.5 text-left hover:bg-[var(--teal-50)]"
              >
                <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--gray-700)]">
                  {step.label}
                </span>
                <StepValue value={step.value} />
              </button>
            ))}
          </div>
        </>
      )}

      <div className="space-y-3 border-t border-[var(--gray-200)] pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold tracking-[-0.01em] text-[var(--gray-700)]">
              Build your own
            </h3>
            <p className="mt-0.5 text-sm text-[var(--gray-500)]">
              {hasEdits
                ? "Picking a starting point replaces your scenario."
                : "Pick a starting point, then change what you disagree with."}
            </p>
          </div>
          {hasEdits && (
            <button
              type="button"
              onClick={onResumeScenario}
              className="text-sm font-medium text-[var(--teal-700)] hover:underline"
            >
              Back to your scenario
            </button>
          )}
        </div>
        <StartFrom campValues={campValues} onSelect={onStartFrom} />
      </div>

      {dataControl}
    </div>
  );
}

export function BuildStep({
  bridge,
  from,
  endLabel,
  hasEdits,
  campValues,
  onStartFrom,
  groups,
  activeGroup,
  onSelectGroup,
  stepDetails,
  referenceLines,
  focusOnArrival,
  readout,
  panel,
  footer,
}) {
  const stepRef = useRef(null);
  const headingRef = useRef(null);
  const rowRefs = useRef(new Map());
  const scrollPending = useRef(true);

  const selectGroup = (id) => {
    scrollPending.current = Boolean(id);
    onSelectGroup(id);
  };

  // Leaving step one from inside it unmounts the focused control.
  useEffect(() => {
    if (!focusOnArrival) return;
    const row = rowRefs.current.get(activeGroup);
    (row?.querySelector("button") ?? headingRef.current).focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  // Arriving from further down the page lands on the step, or on the assumption
  // that brought you here. An opened assumption has to land on screen beside
  // the pinned chart, however far down the list it sits; a row that already
  // fits stays put, so opening it does not move the page under the pointer.
  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    const row = rowRefs.current.get(activeGroup);
    const { top, bottom } = (row ?? stepRef.current).getBoundingClientRect();
    if (top >= HEADER_CLEARANCE_PX && (!row || bottom <= window.innerHeight)) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollBy({ top: top - HEADER_CLEARANCE_PX, behavior: reduceMotion ? "auto" : "smooth" });
  }, [activeGroup]);

  return (
    <div ref={stepRef} className="space-y-5">
      <div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)] outline-none"
        >
          Build your own estimate
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
          Start from one set of assumptions and change what you disagree with.
          Each change adds a bar, so the chart shows what your changes are worth.
        </p>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-500)]">
            Start from
          </p>
          {hasEdits && (
            <button
              type="button"
              onClick={() => onStartFrom(from)}
              className="text-sm font-medium text-[var(--teal-700)] hover:underline"
            >
              Reset to {BRIDGE_ENDPOINTS[from]}
            </button>
          )}
        </div>
        <div className="mt-2">
          <StartFrom campValues={campValues} selected={from} onSelect={onStartFrom} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        {/* Below 640px of height a pinned chart would trap its own lower half. */}
        <div className="min-w-0 space-y-4 md:self-start md:[@media(min-height:640px)]:sticky md:[@media(min-height:640px)]:top-20">
          {bridge.finite === false ? (
            <UnboundedNote />
          ) : (
            <WaterfallChart
              waterfall={waterfallSteps(bridge, BRIDGE_ENDPOINTS[from])}
              totalLabel={endLabel}
              height={340}
              onBarClick={selectGroup}
              activeId={activeGroup}
              clickableIds={new Set(bridge.contributions.map((step) => step.id))}
              referenceLines={referenceLines}
              stepDetails={stepDetails}
              hideTotal={bridge.contributions.length === 0}
            />
          )}
          {hasEdits && bridge.finite !== false && bridge.contributions.length === 0 && (
            <p className="text-sm text-[var(--gray-500)]">
              That change does not move the estimate from this starting point.
            </p>
          )}
          {readout}
        </div>

        <div className="min-w-0 space-y-3">
          <div>
            <h3 className="text-base font-semibold tracking-[-0.01em] text-[var(--gray-700)]">
              Assumptions
            </h3>
            <p className="mt-0.5 text-sm text-[var(--gray-500)]">
              Open one to change it. Each change adds a bar to the chart.
            </p>
          </div>

          <div className="divide-y divide-[var(--gray-200)] overflow-hidden rounded-2xl border border-[var(--gray-200)]">
            {groups.map((group) => {
              const step = bridge.contributions.find((entry) => entry.id === group.id);
              const isActive = activeGroup === group.id;

              return (
                <div
                  key={group.id}
                  ref={(element) => {
                    if (element) rowRefs.current.set(group.id, element);
                    else rowRefs.current.delete(group.id);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => selectGroup(isActive ? null : group.id)}
                    aria-expanded={isActive}
                    aria-controls={isActive ? `panel-${group.id}` : undefined}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors focus-visible:-outline-offset-2 ${
                      isActive ? "bg-[var(--teal-50)]" : "bg-white hover:bg-[var(--teal-50)]"
                    }`}
                  >
                    <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--gray-700)]">
                      {group.label}
                    </span>
                    {step && <StepValue value={step.value} />}
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      className={`h-4 w-4 shrink-0 text-[var(--gray-400)] transition-transform motion-reduce:transition-none ${
                        isActive ? "rotate-180" : ""
                      }`}
                    >
                      <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {isActive && panel}
                </div>
              );
            })}
          </div>

          {footer}
        </div>
      </div>
    </div>
  );
}
