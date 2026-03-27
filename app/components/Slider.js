"use client";

import { useId } from "react";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapToStep(value, min, step) {
  if (!step) {
    return value;
  }

  const snapped = min + Math.round((value - min) / step) * step;
  return Number(snapped.toFixed(6));
}

export default function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  quickPicks = [],
}) {
  const inputId = useId();

  // Hide the badge when the current value matches a quick pick label
  const matchesQuickPick = quickPicks.some((qp) => qp.value === value);

  return (
    <div className="grid gap-2 py-4">
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={inputId}
          className="text-sm font-semibold tracking-[-0.01em] text-[var(--gray-700)]"
        >
          {label}
        </label>
        {!matchesQuickPick && (
          <span className="text-sm font-semibold text-[var(--teal-700)]">
            {format(value)}
          </span>
        )}
      </div>

      {quickPicks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickPicks.map((quickPick) => {
            const isActive = value === quickPick.value;

            return (
              <button
                key={`${label}-${quickPick.label}`}
                type="button"
                onClick={() => onChange(quickPick.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--teal-700)] text-white"
                    : "bg-[var(--gray-100)] text-[var(--gray-600)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                }`}
              >
                {quickPick.label}
              </button>
            );
          })}
        </div>
      )}

      <input
        id={inputId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value === Infinity ? max : value}
        onChange={(event) => {
          const raw = parseFloat(event.target.value);
          onChange(snapToStep(clamp(raw, min, max), min, step));
        }}
        className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--gray-100)] accent-[var(--teal-600)]"
      />
    </div>
  );
}
