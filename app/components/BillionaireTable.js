"use client";

import { useMemo, useState } from "react";
import { formatBillions } from "@/lib/format";
import { estimateCaliforniaIncomeTaxB } from "@/lib/incomeTaxLookup";

const formatB = (v) => {
  if (v >= 1) return `$${v.toFixed(1)}B`;
  if (v >= 0.01) return `$${(v * 1000).toFixed(0)}M`;
  if (v >= 0.001) return `$${(v * 1000).toFixed(1)}M`;
  return `$${(v * 1e6).toFixed(0)}K`;
};

export default function BillionaireTable({
  billionaires,
  incomeTaxLookup,
  excludeRealEstate,
  avoidanceRate,
  incomeYieldRate,
  wealthBase,
}) {
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const filtered =
      wealthBase === "afterDepartures"
        ? billionaires.filter((b) => !b.moved)
        : billionaires;

    return filtered.map((b) => {
      const netWorthB = b.netWorth / 1e9;
      const reB = (excludeRealEstate ? b.realEstate : 0) / 1e9;
      const taxableWealthB = netWorthB - reB;
      const grossTaxB = taxableWealthB * 0.05;
      const collectedTaxB = grossTaxB * (1 - avoidanceRate);
      const annualIncomeB = taxableWealthB * incomeYieldRate;
      const annualIncomeTaxB = estimateCaliforniaIncomeTaxB(
        annualIncomeB,
        incomeTaxLookup
      );

      return {
        name: b.name,
        moved: b.moved,
        netWorthB,
        taxableWealthB,
        collectedTaxB,
        annualIncomeB,
        annualIncomeTaxB,
      };
    });
  }, [
    billionaires,
    excludeRealEstate,
    avoidanceRate,
    incomeYieldRate,
    wealthBase,
    incomeTaxLookup,
  ]);

  const displayed = showAll ? rows : rows.slice(0, 20);
  const totals = useMemo(
    () => ({
      netWorthB: rows.reduce((s, r) => s + r.netWorthB, 0),
      taxableWealthB: rows.reduce((s, r) => s + r.taxableWealthB, 0),
      collectedTaxB: rows.reduce((s, r) => s + r.collectedTaxB, 0),
      annualIncomeB: rows.reduce((s, r) => s + r.annualIncomeB, 0),
      annualIncomeTaxB: rows.reduce((s, r) => s + r.annualIncomeTaxB, 0),
    }),
    [rows]
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--gray-200)] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-500)]">
            <th className="py-3 pr-4">Name</th>
            <th className="px-2 py-3 text-right">Net worth</th>
            <th className="px-2 py-3 text-right">Wealth tax</th>
            <th className="px-2 py-3 text-right">Annual income</th>
            <th className="px-2 py-3 text-right">CA income tax/yr</th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((row) => (
            <tr
              key={row.name}
              className={`border-b border-[var(--gray-100)] ${
                row.moved
                  ? "bg-[var(--red-50)] text-[var(--gray-500)]"
                  : ""
              }`}
            >
              <td className="py-2 pr-4 font-medium text-[var(--gray-700)]">
                {row.name}
                {row.moved && (
                  <span className="ml-2 text-xs text-[var(--red-500)]">
                    left CA
                  </span>
                )}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {formatB(row.netWorthB)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {formatB(row.collectedTaxB)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {formatB(row.annualIncomeB)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {formatB(row.annualIncomeTaxB)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--gray-300)] font-semibold text-[var(--gray-700)]">
            <td className="py-3 pr-4">
              Total ({rows.length} billionaires)
            </td>
            <td className="px-2 py-3 text-right tabular-nums">
              {formatBillions(totals.netWorthB)}
            </td>
            <td className="px-2 py-3 text-right tabular-nums">
              {formatBillions(totals.collectedTaxB)}
            </td>
            <td className="px-2 py-3 text-right tabular-nums">
              {formatBillions(totals.annualIncomeB)}
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
