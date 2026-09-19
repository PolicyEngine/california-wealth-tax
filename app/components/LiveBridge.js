"use client";

import WaterfallChart from "@/app/components/WaterfallChart";
import { formatBillions } from "@/lib/format";

export const BRIDGE_ENDPOINTS = {
  baseline: "Statutory score, no behavior",
  berkeley: "Berkeley assumptions",
  hoover: "Hoover assumptions",
  your: "Your scenario",
};

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
          .filter(([key]) => key !== exclude)
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
  onChangeFrom,
  onChangeTo,
  groups,
  activeGroup,
  onSelectGroup,
  groupSummaries,
  groupMatches,
  referenceLines,
  snapshotDate,
}) {
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
            {from === "berkeley" && to === "hoover"
              ? "What separates the published estimates"
              : "What each assumption is worth"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
            <span className="font-medium text-[var(--gray-700)]">
              {BRIDGE_ENDPOINTS[from]} {formatBillions(bridge.startValue, { showPlus: true })}
              {" \u2192 "}
              {BRIDGE_ENDPOINTS[to]} {formatBillions(bridge.endValue, { showPlus: true })}
            </span>
            , on the same people, Forbes data as of {snapshotDate}, net present
            value as of 2026. Each bar is one assumption&apos;s worth, averaged
            over every order the assumptions could be applied in, so the bars
            sum exactly to the gap. Click a bar to change that assumption.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--gray-600)]">
          <span>From</span>
          <EndpointSelect id="bridge-from" label="Bridge from" value={from} onChange={onChangeFrom} exclude={to} />
          <span>to</span>
          <EndpointSelect id="bridge-to" label="Bridge to" value={to} onChange={onChangeTo} exclude={from} />
        </div>
      </div>

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
          an assumption below or pick different endpoints.
        </p>
      ) : (
        <WaterfallChart
          waterfall={waterfall}
          totalLabel={BRIDGE_ENDPOINTS[to]}
          height={380}
          onBarClick={onSelectGroup}
          activeId={activeGroup}
          clickableIds={clickableIds}
          referenceLines={referenceLines}
        />
      )}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => {
          const step = bridge.contributions.find((entry) => entry.id === group.id);
          const isActive = activeGroup === group.id;
          const matches = groupMatches[group.id];

          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onSelectGroup(isActive ? null : group.id)}
              aria-expanded={isActive}
              className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                isActive
                  ? "border-[var(--teal-600)] bg-[var(--teal-50)]"
                  : "border-[var(--gray-200)] bg-white hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)]"
              }`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--gray-700)]">
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
              </span>
              <span className="mt-1 block text-xs leading-5 text-[var(--gray-500)]">
                {groupSummaries[group.id]}
                {matches.length > 0 && (
                  <span className="text-[var(--gray-400)]"> · as in {matches.join(", ")}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
