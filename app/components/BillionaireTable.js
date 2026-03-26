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

export default function BillionaireTable({
  rows,
  avoidanceRate,
  excludeRealEstate,
}) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? rows : rows.slice(0, 20);

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
          {displayed.map((row) => (
            <tr
              key={row.name}
              className={`border-b border-[var(--gray-100)] ${
                row.moved && !row.inBase
                  ? "bg-[var(--red-50)] text-[var(--gray-500)]"
                  : row.moved
                    ? "bg-amber-50"
                    : ""
              }`}
            >
              <td className="py-2 pr-4 font-medium text-[var(--gray-700)]">
                {row.name}
                {row.moved && !row.inBase && (
                  <span className="ml-2 text-xs text-[var(--red-500)]">
                    left CA
                  </span>
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
          ))}
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
