"use client";

import { formatBillions } from "@/lib/format";
import { PUBLISHED_ESTIMATES } from "@/lib/presets";

const SET_LABELS = {
  baseline: "Statutory score",
  berkeley: "Berkeley assumptions",
  hoover: "Hoover assumptions",
};
const SET_NOTES = {
  baseline: "no behavioral response",
};

export default function ResultStrip({
  headlineValue,
  headlineLabel,
  presentValue,
  activeSet,
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-500)]">
        {activeSet ? SET_LABELS[activeSet] : "Your scenario"}: {headlineLabel}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4">
        <span
          className={`text-3xl font-semibold tracking-[-0.04em] ${
            headlineValue >= 0 ? "text-[var(--teal-700)]" : "text-[var(--red-600)]"
          }`}
        >
          {formatBillions(headlineValue, { showPlus: true })}
        </span>
        {presentValue !== headlineValue && (
          <span className="text-sm text-[var(--gray-600)]">
            Present value as of 2026:{" "}
            <span className="font-semibold text-[var(--gray-700)]">
              {formatBillions(presentValue, { showPlus: true })}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

export function StartFrom({ campValues, selected = null, onSelect }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {Object.entries(SET_LABELS).map(([key, label]) => {
        const isSelected = selected === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`rounded-2xl border px-3.5 py-2 text-left text-sm transition-colors ${
              isSelected
                ? "border-[var(--teal-600)] bg-[var(--teal-700)] text-white"
                : "border-[var(--gray-300)] bg-white text-[var(--gray-700)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
            }`}
          >
            <span className="block font-medium">
              {label}
              {SET_NOTES[key] && (
                <span className={`font-normal ${isSelected ? "text-white/80" : "text-[var(--gray-500)]"}`}>
                  , {SET_NOTES[key]}
                </span>
              )}
            </span>
            <span
              className={`block text-xs tabular-nums ${
                isSelected ? "text-white/80" : "text-[var(--gray-500)]"
              }`}
            >
              {formatBillions(campValues[key], { showPlus: true })} PV on this roster
            </span>
            {PUBLISHED_ESTIMATES[key] && (
              <span
                title={PUBLISHED_ESTIMATES[key].detail}
                className={`block text-xs ${
                  isSelected ? "text-white/70" : "text-[var(--gray-400)]"
                }`}
              >
                {PUBLISHED_ESTIMATES[key].label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ScenarioActions({ dataControl, copyStatus, onCopyLink }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {dataControl}
      <button
        type="button"
        onClick={onCopyLink}
        className="rounded-full border border-[var(--gray-300)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--gray-700)] transition-colors hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)]"
      >
        {copyStatus === "idle" ? "Copy link to this scenario" : copyStatus}
      </button>
    </div>
  );
}

export function ResultNotes({ headlineNote }) {
  return (
    <section className="space-y-2 rounded-[30px] border border-[var(--gray-200)] bg-white p-6 text-xs leading-5 text-[var(--gray-500)] shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
      {headlineNote && <p>{headlineNote}</p>}
      <p>
        The Legislative Analyst&apos;s Office expects &ldquo;tens of billions of
        dollars spread over several years&rdquo; and calls an ongoing income-tax
        decrease of &ldquo;less than $1 billion per year&rdquo; possible.
      </p>
      <p>
        Since October 21, 2026 the Hoover assumptions follow Jaros and
        Rauh&apos;s NBER version (a 50% chance the measure survives legal
        challenge, Mark Zuckerberg and non-US citizens out of the base, and 45%
        of the cohort&apos;s income tax lost); before, they followed Rauh et
        al.&apos;s March 2026 paper.
      </p>
    </section>
  );
}
