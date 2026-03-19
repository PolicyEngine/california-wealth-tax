"use client";

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

export default function WaterfallChart({ waterfall }) {
  // Build waterfall data with invisible base bars
  let running = 0;
  const data = waterfall.map((step) => {
    const base = running;
    running += step.value;
    return {
      label: step.label,
      value: step.value,
      base: step.value >= 0 ? base : base + step.value,
      height: Math.abs(step.value),
      total: running,
    };
  });

  // Add net total bar
  const net = data[data.length - 1].total;
  data.push({
    label: "Net impact",
    value: net,
    base: 0,
    height: Math.abs(net),
    total: net,
    isTotal: true,
  });

  return (
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
          tickFormatter={(v) => `$${v}B`}
          tick={{ fontSize: 11 }}
        />
        <Tooltip
          formatter={(value, name) => {
            if (name === "base") return null;
            return [`$${value.toFixed(1)}B`, ""];
          }}
        />
        <ReferenceLine y={0} stroke="var(--gray-400)" />
        {/* Invisible base */}
        <Bar dataKey="base" stackId="waterfall" fill="transparent" />
        {/* Visible bar */}
        <Bar dataKey="height" stackId="waterfall" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={index}
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
  );
}
