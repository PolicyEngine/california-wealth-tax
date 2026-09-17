"use client";

import WaterfallChart from "@/app/components/WaterfallChart";
import { formatBillions } from "@/lib/format";

export default function AssumptionBridge({ bridge, snapshotDate }) {
  const waterfall = [
    { label: "Berkeley assumptions", value: bridge.startValue },
    ...bridge.contributions.map((step) => ({
      label: step.label,
      value: step.value,
    })),
  ];
  const ranked = [...bridge.contributions].sort(
    (a, b) => Math.abs(b.value) - Math.abs(a.value)
  );

  return (
    <section className="space-y-6 rounded-[30px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
      <div className="max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
          Why estimates differ
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
          The same model, the same people, Forbes data as of {snapshotDate}.
          The Berkeley assumptions give{" "}
          {formatBillions(bridge.startValue, { showPlus: true })}; the Hoover
          assumptions give {formatBillions(bridge.endValue, { showPlus: true })}.
          Five assumptions separate them. Each bar is what one assumption is
          worth, averaged over every order in which the five could be applied,
          so the bars sum exactly to the gap. Values are net present value as
          of 2026. The PolicyEngine baseline, with no behavioral response, is{" "}
          {formatBillions(bridge.baselineValue, { showPlus: true })}.
        </p>
      </div>

      <WaterfallChart
        waterfall={waterfall}
        totalLabel="Hoover assumptions"
        height={380}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--gray-200)] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-500)]">
              <th className="py-3 pr-4">Assumption</th>
              <th className="px-2 py-3 text-right">Worth</th>
              <th className="px-2 py-3 text-right">If applied first or last</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((step) => (
              <tr key={step.id} className="border-b border-[var(--gray-100)]">
                <td className="py-2 pr-4 font-medium text-[var(--gray-700)]">
                  {step.label}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatBillions(step.value, { showPlus: true })}
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-[var(--gray-500)]">
                  {formatBillions(step.min, { showPlus: true })} to{" "}
                  {formatBillions(step.max, { showPlus: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="max-w-3xl text-xs leading-5 text-[var(--gray-500)]">
        Both assumption sets are applied to this calculator&apos;s roster. Galle,
        Gamage, Saez and Shanske&apos;s own roster adds 24 non-citizen residents
        whom Forbes does not place in a state; Rauh et al.&apos;s is fixed at
        October 17, 2025. The range in the last column is the smallest and
        largest effect of the assumption across all orderings: migration and
        income tax interact, because each person who leaves takes an income-tax
        stream with them.
      </p>
    </section>
  );
}
