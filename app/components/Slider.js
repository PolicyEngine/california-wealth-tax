"use client";

export default function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  description,
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <label className="text-sm font-medium text-[var(--gray-700)]">
          {label}
        </label>
        <span className="text-sm font-semibold text-[var(--teal-700)]">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value === Infinity ? max : value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[var(--teal-600)]"
      />
      {description && (
        <p className="text-xs text-[var(--gray-400)] mt-1">{description}</p>
      )}
    </div>
  );
}
