"use client";

import { useEffect, useRef } from "react";

import WaterfallChart from "@/app/components/WaterfallChart";
import { formatBillions } from "@/lib/format";

export const BRIDGE_ENDPOINTS = {
  baseline: "Statutory score, no behavior",
  berkeley: "Berkeley assumptions",
  hoover: "Hoover assumptions",
  your: "Your scenario",
};

// Clears the site header when an opened assumption scrolls into view.
const HEADER_CLEARANCE_PX = 88;

function EndpointSelect({ value, onChange, exclude, hasScenario, id, label }) {
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
          .filter(([key]) => key !== exclude && (hasScenario || key !== "your"))
          .map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
      </select>
    </label>
  );
}

export default function LiveBridge({
  bridge,
  from,
  to,
  hasScenario,
  onChangeFrom,
  onChangeTo,
  groups,
  activeGroup,
  onSelectGroup,
  stepDetails,
  referenceLines,
  snapshotDate,
  readout,
  panel,
  footer,
}) {
  const rowRefs = useRef(new Map());
  const scrollPending = useRef(false);

  const selectGroup = (id) => {
    scrollPending.current = Boolean(id);
    onSelectGroup(id);
  };

  // An opened assumption has to land on screen beside the pinned chart,
  // however far down the list it sits. A row that already fits stays put, so
  // opening it does not move the page under the pointer.
  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    const row = rowRefs.current.get(activeGroup);
    if (!row) return;
    const { top, bottom } = row.getBoundingClientRect();
    if (top >= HEADER_CLEARANCE_PX && bottom <= window.innerHeight) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollBy({ top: top - HEADER_CLEARANCE_PX, behavior: reduceMotion ? "auto" : "smooth" });
  }, [activeGroup]);

  const waterfall = [
    { id: "start", label: BRIDGE_ENDPOINTS[from], value: bridge.startValue },
    ...bridge.contributions.map((step) => ({
      id: step.id,
      label: step.shortLabel,
      value: step.value,
    })),
  ];
  const clickableIds = new Set(bridge.contributions.map((step) => step.id));

  return (
    <section className="space-y-5 rounded-[30px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
            {from === "berkeley" && to === "hoover"
              ? "What separates the published estimates"
              : "What each assumption is worth"}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--gray-600)]">
            <span>From</span>
            <EndpointSelect id="bridge-from" label="Bridge from" value={from} onChange={onChangeFrom} exclude={to} hasScenario={hasScenario} />
            <span>to</span>
            <EndpointSelect id="bridge-to" label="Bridge to" value={to} onChange={onChangeTo} exclude={from} hasScenario={hasScenario} />
          </div>
        </div>
        <p className="text-sm leading-6 text-[var(--gray-500)]">
          <span className="font-medium text-[var(--gray-700)]">
            {BRIDGE_ENDPOINTS[from]} {formatBillions(bridge.startValue, { showPlus: true })}
            {" \u2192 "}
            {BRIDGE_ENDPOINTS[to]} {formatBillions(bridge.endValue, { showPlus: true })}
          </span>
          , on the same people, Forbes data as of {snapshotDate}, net present
          value as of 2026. Each bar is one assumption&apos;s worth, averaged
          over every order the assumptions could be applied in, so the bars sum
          exactly to the gap.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        {/* On a short screen a pinned chart would trap its own lower half. */}
        <div className="min-w-0 space-y-4 lg:self-start lg:[@media(min-height:720px)]:sticky lg:[@media(min-height:720px)]:top-20">
          {bridge.finite === false ? (
            <p className="rounded-2xl border border-dashed border-[var(--gray-300)] px-5 py-6 text-sm text-[var(--gray-500)]">
              One of these scenarios has an unbounded present value: the lost
              income-tax stream grows at least as fast as it is discounted and
              movers return. Shorten the horizon, lower the growth rate, or raise
              the discount rate to bridge them.
            </p>
          ) : bridge.contributions.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--gray-300)] px-5 py-6 text-sm text-[var(--gray-500)]">
              {BRIDGE_ENDPOINTS[from]} and {BRIDGE_ENDPOINTS[to]} share every
              assumption that matters here, so there is nothing to bridge: both
              give {formatBillions(bridge.startValue, { showPlus: true })}. Change
              an assumption or pick different endpoints.
            </p>
          ) : (
            <WaterfallChart
              waterfall={waterfall}
              totalLabel={BRIDGE_ENDPOINTS[to]}
              height={380}
              onBarClick={selectGroup}
              activeId={activeGroup}
              clickableIds={clickableIds}
              referenceLines={referenceLines}
              stepDetails={stepDetails}
            />
          )}
          {readout}
        </div>

        <div className="min-w-0 space-y-3">
          <div>
            <h3 className="text-base font-semibold tracking-[-0.01em] text-[var(--gray-700)]">
              Assumptions
            </h3>
            <p className="mt-0.5 text-sm text-[var(--gray-500)]">
              Click a bar or a row to change it. The chart updates as you go.
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
                    aria-controls={`panel-${group.id}`}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isActive ? "bg-[var(--teal-50)]" : "bg-white hover:bg-[var(--teal-50)]"
                    }`}
                  >
                    <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--gray-700)]">
                      {group.label}
                    </span>
                    {step && (
                      <span
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          step.value >= 0 ? "text-[var(--teal-700)]" : "text-[var(--red-600)]"
                        }`}
                      >
                        {formatBillions(step.value, { showPlus: true })}
                      </span>
                    )}
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
    </section>
  );
}
