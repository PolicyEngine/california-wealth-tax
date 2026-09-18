"use client";

import { formatBillions } from "@/lib/format";
import { PUBLISHED_ESTIMATES } from "@/lib/presets";

const SET_LABELS = {
  baseline: "PolicyEngine baseline",
  berkeley: "Berkeley assumptions",
  hoover: "Hoover assumptions",
};

export default function ResultStrip({
  headlineValue,
  headlineLabel,
  headlineNote,
  presentValue,
  campValues,
  activeSet,
  onApplySet,
  copyStatus,
  onCopyLink,
  dataControl,
}) {
  return (
    <section className="rounded-[30px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-500)]">
            {headlineLabel}
          </p>
          <div
            className={`mt-3 text-5xl font-semibold tracking-[-0.05em] ${
              headlineValue >= 0 ? "text-[var(--teal-600)]" : "text-[var(--red-600)]"
            }`}
          >
            {formatBillions(headlineValue, { showPlus: true })}
          </div>
          <p className="mt-2 text-sm text-[var(--gray-600)]">
            Present value as of 2026:{" "}
            <span className="font-semibold text-[var(--gray-700)]">
              {formatBillions(presentValue, { showPlus: true })}
            </span>
          </p>
          <p className="mt-2 max-w-xl text-xs leading-5 text-[var(--gray-500)]">
            {headlineNote}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-500)]">
              Start from
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(SET_LABELS).map(([key, label]) => {
                const selected = activeSet === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onApplySet(key)}
                    className={`rounded-full border px-3.5 py-2 text-left text-sm transition-colors ${
                      selected
                        ? "border-[var(--teal-600)] bg-[var(--teal-700)] text-white"
                        : "border-[var(--gray-300)] bg-white text-[var(--gray-700)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                    }`}
                  >
                    <span className="block font-medium">{label}</span>
                    <span
                      className={`block text-xs tabular-nums ${
                        selected ? "text-white/80" : "text-[var(--gray-500)]"
                      }`}
                    >
                      {formatBillions(campValues[key], { showPlus: true })} PV on this roster
                    </span>
                    {PUBLISHED_ESTIMATES[key] && (
                      <span
                        title={PUBLISHED_ESTIMATES[key].detail}
                        className={`block text-xs ${
                          selected ? "text-white/70" : "text-[var(--gray-400)]"
                        }`}
                      >
                        {PUBLISHED_ESTIMATES[key].label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--gray-500)]">
              The Legislative Analyst&apos;s Office expects &ldquo;tens of
              billions of dollars spread over several years&rdquo; and an
              ongoing income-tax loss of &ldquo;less than $1 billion per
              year.&rdquo;
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {dataControl}
            <button
              type="button"
              onClick={onCopyLink}
              className="rounded-full border border-[var(--gray-300)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--gray-700)] transition-colors hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
            >
              {copyStatus === "idle" ? "Copy link to this scenario" : copyStatus}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
