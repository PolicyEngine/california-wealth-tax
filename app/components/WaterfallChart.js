"use client";

import Image from "next/image";
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
    : "/us/california-wealth-tax/embed";

function WaterfallTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const entry = payload[0].payload;

  return (
    <div className="rounded-2xl border border-[var(--gray-200)] bg-white/95 px-4 py-3 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
        {entry.isTotal ? "Net result" : "Step effect"}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--gray-700)]">
        {entry.label}
      </p>
      <div className="mt-3 space-y-1 text-sm text-[var(--gray-600)]">
        <div className="flex min-w-[12rem] items-center justify-between gap-4">
          <span>Change</span>
          <span className="font-semibold text-[var(--gray-700)]">
            {formatBillions(entry.value, { showPlus: true })}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Total after step</span>
          <span className="font-semibold text-[var(--gray-700)]">
            {formatBillions(entry.total, { showPlus: true })}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function WaterfallChart({ waterfall }) {
  const data = buildWaterfallData(waterfall);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tickFormatter={(value) => formatBillions(value, { decimals: 0 })}
            tick={{ fontSize: 11 }}
          />
          <Tooltip content={<WaterfallTooltip />} cursor={{ fill: "rgba(44, 122, 123, 0.05)" }} />
          <ReferenceLine y={0} stroke="var(--gray-400)" />
          {/* Invisible base */}
          <Bar dataKey="base" stackId="waterfall" fill="transparent" />
          {/* Visible bar */}
          <Bar dataKey="height" stackId="waterfall">
            {data.map((entry, index) => (
              <Cell
                key={index}
                radius={entry.isNegative ? [0, 0, 4, 4] : [4, 4, 0, 0]}
                fill={
                  entry.isTotal
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
