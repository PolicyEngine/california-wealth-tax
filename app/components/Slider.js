"use client";

import { useEffect, useId, useState } from "react";

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
  description,
  quickPicks = [],
  minLabel,
  maxLabel,
  inputSuffix,
  showNumberInput = true,
  toInputValue = (currentValue) => String(currentValue),
  fromInputValue = (rawValue) => Number(rawValue),
}) {
  const inputId = useId();
  const formattedValue = toInputValue(value);
  const [draftValue, setDraftValue] = useState(formattedValue);

  useEffect(() => {
    setDraftValue(formattedValue);
  }, [formattedValue]);

  function commitDraftValue() {
    const parsed = fromInputValue(draftValue);

    if (!Number.isFinite(parsed)) {
      setDraftValue(toInputValue(value));
      return;
    }

    const nextValue = snapToStep(clamp(parsed, min, max), min, step);
    onChange(nextValue);
    setDraftValue(toInputValue(nextValue));
  }

  return (
    <div className="grid gap-3 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xl space-y-1">
          <label
            htmlFor={inputId}
            className="text-sm font-semibold tracking-[-0.01em] text-[var(--gray-700)]"
          >
            {label}
          </label>
          {description && (
            <p className="text-sm leading-6 text-[var(--gray-600)]">
              {description}
            </p>
          )}
        </div>
        <span className="inline-flex min-w-[7.5rem] items-center justify-center rounded-full bg-[var(--gray-100)] px-3 py-2 text-sm font-semibold text-[var(--teal-700)]">
          {format(value)}
        </span>
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

      <div className="space-y-2">
        <input
          id={inputId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value === Infinity ? max : value}
          onChange={(event) => onChange(parseFloat(event.target.value))}
          className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--gray-100)] accent-[var(--teal-600)]"
        />
        <div className="flex justify-between text-xs uppercase tracking-[0.08em] text-[var(--gray-400)]">
          <span>{minLabel ?? format(min)}</span>
          <span>{maxLabel ?? format(max)}</span>
        </div>
      </div>

      {showNumberInput && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="inline-flex items-center rounded-full border border-[var(--gray-300)] bg-white px-3 py-2 shadow-sm">
            <input
              type="number"
              value={draftValue}
              onChange={(event) => setDraftValue(event.target.value)}
              onBlur={commitDraftValue}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitDraftValue();
                }
              }}
              className="w-24 bg-transparent text-right font-semibold text-[var(--gray-700)] outline-none"
            />
            {inputSuffix && (
              <span className="ml-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-400)]">
                {inputSuffix}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
