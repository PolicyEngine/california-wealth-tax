"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function EffectiveRatesChart({ data }) {
  // Reshape: for each income level, compute CA/Fed ratio for wages vs LTCG
  const incomes = [...new Set(data.map((d) => d.income))];

  const chartData = incomes.map((income) => {
    const wages = data.find((d) => d.income === income && d.type === "wages");
    const ltcg = data.find((d) => d.income === income && d.type === "ltcg");
    return {
      income: income / 1e6,
      label: `$${income / 1e6}M`,
      wagesRatio: wages?.ca_fed_ratio,
      ltcgRatio: ltcg?.ca_fed_ratio,
    };
  });

  const pctFormatter = (v) => `${(v * 100).toFixed(0)}%`;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
        />
        <YAxis
          tickFormatter={pctFormatter}
          domain={[0, 1]}
          tick={{ fontSize: 11 }}
          label={{
            value: "CA tax / Federal tax",
            angle: -90,
            position: "insideLeft",
            style: { fontSize: 11 },
          }}
        />
        <Tooltip
          formatter={(value, name) => [
            pctFormatter(value),
            name === "wagesRatio" ? "Wages" : "Long-term capital gains",
          ]}
        />
        <Legend
          formatter={(value) =>
            value === "wagesRatio" ? "All wages" : "All long-term capital gains"
          }
        />
        <Line
          type="monotone"
          dataKey="wagesRatio"
          stroke="var(--teal-600)"
          strokeWidth={3}
          dot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="ltcgRatio"
          stroke="#F5A623"
          strokeWidth={3}
          dot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
