"use client";

import { useState } from "react";
import { formatBillions } from "@/lib/format";

const formatB = (v) => {
  if (v >= 1) return `$${v.toFixed(1)}B`;
  if (v >= 0.01) return `$${(v * 1000).toFixed(0)}M`;
  if (v >= 0.001) return `$${(v * 1000).toFixed(1)}M`;
  if (v > 0) return `$${(v * 1e6).toFixed(0)}K`;
  return "—";
};

const STATUS_STYLES = {
  neutral: "border-[var(--gray-200)] bg-[var(--gray-50)] text-[var(--gray-600)]",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-700",
};

function getRowStatuses(row) {
  const statuses = [];

  if (row.excludeFromCorrectedBase) {
    statuses.push({ label: "Excluded from corrected base", tone: "danger" });
  }

  if (row.departureTiming === "pre_snapshot") {
    statuses.push({ label: "Pre-snapshot departure", tone: "danger" });
  }

  if (row.departureTiming === "post_snapshot") {
    statuses.push({ label: "Post-snapshot departure", tone: "warning" });
  }

  if (row.departureTiming === "unconfirmed") {
    statuses.push({ label: "Reported departure", tone: "warning" });
  }

  if (row.includeInRawForbes === false) {
    statuses.push({ label: "Added from paper corrections", tone: "neutral" });
  }

  return statuses;
}

export default function BillionaireTable({
  rows,
  avoidanceRate,
  excludeRealEstate,
}) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...rows].sort((a, b) => b.netWorthB - a.netWorthB);
  const displayed = showAll ? sorted : sorted.slice(0, 20);

  const totals = {
    netWorthB: rows.reduce((s, r) => s + r.netWorthB, 0),
    grossTaxB: rows.reduce((s, r) => s + r.grossTaxB * (1 - avoidanceRate), 0),
    annualIncomeTaxB: rows.reduce((s, r) => s + r.annualIncomeTaxB, 0),
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--gray-200)] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-500)]">
            <th className="py-3 pr-4">Name</th>
            <th className="px-2 py-3 text-right">Net worth</th>
            {excludeRealEstate && (
              <th className="px-2 py-3 text-right">RE excluded</th>
            )}
            <th className="px-2 py-3 text-right">Rate</th>
            <th className="px-2 py-3 text-right">Wealth tax</th>
            <th className="px-2 py-3 text-right">CA income tax/yr</th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((row) => {
            const statuses = getRowStatuses(row);

            return (
              <tr
                key={row.name}
                className={`border-b border-[var(--gray-100)] ${
                  !row.inBase
                    ? "bg-[var(--gray-50)] text-[var(--gray-500)]"
                    : row.departureTiming
                      ? "bg-amber-50/60"
                      : ""
                }`}
              >
                <td className="py-2 pr-4 font-medium text-[var(--gray-700)]">
                  <div>{row.name}</div>
                  {statuses.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {statuses.map((status) => (
                        <span
                          key={`${row.name}-${status.label}`}
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status.tone]}`}
                        >
                          {status.label}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatB(row.netWorthB)}
                </td>
                {excludeRealEstate && (
                  <td className="px-2 py-2 text-right tabular-nums text-[var(--gray-500)]">
                    {row.netWorthB !== row.taxableWealthB
                      ? formatB(row.netWorthB - row.taxableWealthB)
                      : "—"}
                  </td>
                )}
                <td className="px-2 py-2 text-right tabular-nums">
                  {(row.rate * 100).toFixed(1)}%
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatB(row.grossTaxB * (1 - avoidanceRate))}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatB(row.annualIncomeTaxB)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--gray-300)] font-semibold text-[var(--gray-700)]">
            <td className="py-3 pr-4">Total ({rows.length})</td>
            <td className="px-2 py-3 text-right tabular-nums">
              {formatBillions(totals.netWorthB)}
            </td>
            {excludeRealEstate && <td className="px-2 py-3"></td>}
            <td className="px-2 py-3"></td>
            <td className="px-2 py-3 text-right tabular-nums">
              {formatBillions(totals.grossTaxB)}
            </td>
            <td className="px-2 py-3 text-right tabular-nums">
              {formatBillions(totals.annualIncomeTaxB)}
            </td>
          </tr>
        </tfoot>
      </table>
      {!showAll && rows.length > 20 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 text-sm font-medium text-[var(--teal-600)] hover:text-[var(--teal-700)]"
        >
          Show all {rows.length} billionaires
        </button>
      )}
    </div>
  );
}
