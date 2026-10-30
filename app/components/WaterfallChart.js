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
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { formatBillions } from "@/lib/format";
import { buildWaterfallData } from "@/lib/waterfall";

const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : "/us/california-wealth-tax";

function WaterfallTooltip({ active, payload, clickHint }) {
  if (!active || !payload?.length) {
    return null;
  }

  const entry = payload[0].payload;
  const detail = entry.detail;

  return (
    <div className="max-w-[20rem] rounded-2xl border border-[var(--gray-200)] bg-white/95 px-4 py-3 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
        {entry.isTotal ? "Result" : entry.isStart ? "Starting point" : "Step effect"}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--gray-700)]">
        {detail?.title ?? entry.label}
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
        {detail && (
          <dl className="space-y-1 pt-2 text-xs leading-5 text-[var(--gray-500)]">
            {detail.endpoints.map((endpoint) => (
              <div key={endpoint.label}>
                <dt className="font-medium text-[var(--gray-600)]">{endpoint.label}</dt>
                <dd>
                  {endpoint.setting}
                  {endpoint.matches.length > 0 && (
                    <span className="text-[var(--gray-400)]"> · as in {endpoint.matches.join(", ")}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {entry.clickable && (
          <p className="pt-1 text-xs text-[var(--teal-700)]">{clickHint}</p>
        )}
      </div>
    </div>
  );
}

// Below this width the category labels overlap into a smear; the assumption
// list and the tooltip carry the names there.
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
  stepDetails = null,
  clickHint = "Click to adjust",
  hideTotal = false,
}) {
  const isNarrow = useIsNarrow();
  const [pointingAtStep, setPointingAtStep] = useState(false);
  // On a phone a tap shows the tooltip, and the list on the page opens the step.
  const canClick = Boolean(onBarClick) && !isNarrow;
  const data = buildWaterfallData(waterfall, totalLabel ? { totalLabel } : {})
    .map((entry, index) => ({
      ...entry,
      isStart: index === 0,
      clickable: canClick && (clickableIds?.has(entry.id) ?? false),
      detail: stepDetails?.[entry.id],
    }))
    .filter((entry) => !(hideTotal && entry.isTotal));
  const openStep = (item) => {
    // recharts 3 passes the rectangle item; the data row is its payload.
    const entry = item?.payload ?? item;

    if (entry?.clickable) {
      onBarClick(entry.id);
    }
  };
  const isClickableIndex = (index) =>
    index != null && Boolean(data[Number(index)]?.clickable);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 18, right: 16, left: 10, bottom: 5 }}
          onMouseMove={(state) => setPointingAtStep(isClickableIndex(state?.activeTooltipIndex))}
          onMouseLeave={() => setPointingAtStep(false)}
          style={pointingAtStep ? { cursor: "pointer" } : undefined}
        >
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
          <Tooltip content={<WaterfallTooltip clickHint={clickHint} />} cursor={{ fill: "rgba(44, 122, 123, 0.05)" }} />
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
          {/* Invisible base. Neither bar animates: the chart follows a dragged slider. */}
          <Bar
            dataKey="base"
            stackId="waterfall"
            fill="transparent"
            isAnimationActive={false}
            maxBarSize={96}
            onClick={openStep}
          />
          {/* Visible bar. The background makes the whole column a target: the
              smallest steps draw bars a pixel tall. */}
          <Bar
            dataKey="height"
            stackId="waterfall"
            isAnimationActive={false}
            maxBarSize={96}
            background={{ fill: "transparent", stroke: "none" }}
            onClick={openStep}
          >
            {!isNarrow && (
              <LabelList
                dataKey="value"
                position="top"
                formatter={(value) => formatBillions(value, { showPlus: true })}
                fontSize={11}
                fontWeight={600}
                fill="var(--gray-600)"
              />
            )}
            {data.map((entry) => (
              <Cell
                key={entry.id}
                radius={entry.isNegative ? [0, 0, 4, 4] : [4, 4, 0, 0]}
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
