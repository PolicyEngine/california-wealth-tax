"use client";

import Image from "next/image";
import {
  Bar,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBillions } from "@/lib/format";

const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : "/us/california-wealth-tax/embed";

function CashFlowTooltip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0].payload;

  return (
    <div className="rounded-2xl border border-[var(--gray-200)] bg-white/95 px-4 py-3 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-400)]">
        {label}
      </p>
      <p className="mt-1 text-xs text-[var(--gray-500)]">
        {point.relativeYearLabel}
      </p>
      <div className="mt-2 space-y-1 text-sm text-[var(--gray-600)]">
        <div className="flex min-w-[15rem] items-center justify-between gap-4">
          <span>Wealth tax receipt</span>
          <span className="font-semibold text-[var(--gray-700)]">
            {formatBillions(point.wealthTaxReceipt, { showPlus: true })}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Income tax loss</span>
          <span className="font-semibold text-[var(--gray-700)]">
            {formatBillions(-point.incomeTaxLoss, { showPlus: true })}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Annual net cash flow</span>
          <span className="font-semibold text-[var(--gray-700)]">
            {formatBillions(point.netCashFlow, { showPlus: true })}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Discounted annual flow</span>
          <span className="font-semibold text-[var(--gray-700)]">
            {formatBillions(point.discountedNetCashFlow, { showPlus: true })}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CashFlowChart({ data }) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 12 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} />
          <YAxis
            tickFormatter={(value) => formatBillions(value, { decimals: 0 })}
            tick={{ fontSize: 11 }}
          />
          <Tooltip content={<CashFlowTooltip />} cursor={{ fill: "rgba(44, 122, 123, 0.05)" }} />
          <ReferenceLine y={0} stroke="var(--gray-400)" />
          <Bar dataKey="netCashFlow" name="Annual net cash flow" radius={[6, 6, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.year}
                fill={entry.netCashFlow >= 0 ? "var(--teal-500)" : "var(--red-400)"}
              />
            ))}
          </Bar>
        </ComposedChart>
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
