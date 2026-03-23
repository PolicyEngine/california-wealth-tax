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
import { formatBillions } from "@/lib/format";
import { buildWaterfallData } from "@/lib/waterfall";

export default function WaterfallChart({ waterfall }) {
  const data = buildWaterfallData(waterfall);

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
          tickFormatter={(value) => formatBillions(value, { decimals: 0 })}
          tick={{ fontSize: 11 }}
        />
        <Tooltip
          formatter={(_, name, item) => {
            if (name === "base") return null;
            return [formatBillions(item.payload.value), ""];
          }}
        />
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
  );
}
