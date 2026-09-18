"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { formatBillions } from "@/lib/format";
import { buildWaterfallData } from "@/lib/waterfall";

const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : "/us/california-wealth-tax";

function WaterfallTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const entry = payload[0].payload;

  return (
    <div className="rounded-2xl border border-[var(--gray-200)] bg-white/95 px-4 py-3 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
        {entry.isTotal ? "Result" : entry.isStart ? "Starting point" : "Step effect"}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--gray-700)]">
        {entry.label}
      </p>
      <div className="mt-3 space-y-1 text-sm text-[var(--gray-600)]">
        <div className="flex min-w-[12rem] items-center justify-between gap-4">
          <span>{entry.isStart || entry.isTotal ? "Value" : "Change"}</span>
          <span className="font-semibold text-[var(--gray-700)]">
            {formatBillions(entry.value, { showPlus: !entry.isStart })}
          </span>
        </div>
        {!entry.isStart && !entry.isTotal && (
          <div className="flex items-center justify-between gap-4">
            <span>Total after step</span>
            <span className="font-semibold text-[var(--gray-700)]">
              {formatBillions(entry.total, { showPlus: true })}
            </span>
          </div>
        )}
        {entry.clickable && (
          <p className="pt-1 text-xs text-[var(--teal-700)]">Click to adjust</p>
        )}
      </div>
    </div>
  );
}

// Below this width the category labels overlap into a smear; the cards under
// the chart and the tooltip carry the names there.
function useIsNarrow(maxWidth = 640) {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setIsNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [maxWidth]);

  return isNarrow;
}

export default function WaterfallChart({
  waterfall,
  totalLabel,
  height = 300,
  onBarClick,
  activeId = null,
  clickableIds = null,
  referenceLines = [],
}) {
  const isNarrow = useIsNarrow();
  const data = buildWaterfallData(waterfall, totalLabel ? { totalLabel } : {}).map(
    (entry, index) => ({
      ...entry,
      isStart: index === 0,
      clickable: Boolean(onBarClick) && (clickableIds?.has(entry.id) ?? false),
    })
  );

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 18, right: 16, left: 10, bottom: 5 }}>
          <XAxis
            dataKey="label"
            tick={isNarrow ? false : { fontSize: 11 }}
            interval={0}
            angle={-18}
            textAnchor="end"
            height={isNarrow ? 8 : 60}
          />
          <YAxis
            tickFormatter={(value) => formatBillions(value, { decimals: 0 })}
            tick={{ fontSize: 11 }}
          />
          <Tooltip content={<WaterfallTooltip />} cursor={{ fill: "rgba(44, 122, 123, 0.05)" }} />
          <ReferenceLine y={0} stroke="var(--gray-400)" />
          {referenceLines.map((line) => (
            <ReferenceLine
              key={line.label}
              y={line.value}
              stroke={line.stroke ?? "var(--gray-500)"}
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{
                value: `${line.label} ${formatBillions(line.value, { showPlus: true })}`,
                position: "insideTopRight",
                fontSize: 11,
                fill: line.stroke ?? "var(--gray-500)",
              }}
            />
          ))}
          {/* Invisible base */}
          <Bar dataKey="base" stackId="waterfall" fill="transparent" />
          {/* Visible bar */}
          <Bar
            dataKey="height"
            stackId="waterfall"
            onClick={(item) => {
              // recharts 3 passes the rectangle item; the data row is its payload.
              const entry = item?.payload ?? item;

              if (onBarClick && entry?.clickable) {
                onBarClick(entry.id);
              }
            }}
            className={onBarClick ? "cursor-pointer" : undefined}
          >
            {data.map((entry) => (
              <Cell
                key={entry.id}
                radius={entry.isNegative ? [0, 0, 4, 4] : [4, 4, 0, 0]}
                opacity={activeId && entry.id !== activeId ? 0.55 : 1}
                stroke={entry.id === activeId ? "var(--gray-700)" : "none"}
                strokeWidth={entry.id === activeId ? 2 : 0}
                fill={
                  entry.isTotal || entry.isStart
                    ? entry.total >= 0
                      ? "var(--teal-500)"
                      : "var(--red-500)"
                    : entry.value >= 0
                      ? "var(--teal-400)"
                      : "var(--red-400)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <Image
        src={`${basePath}/policyengine-logo.svg`}
        alt=""
        aria-hidden="true"
        width={84}
        height={17}
        className="pointer-events-none absolute bottom-1 right-4 opacity-30"
      />
    </div>
  );
}
