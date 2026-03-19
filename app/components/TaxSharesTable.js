"use client";

export default function TaxSharesTable({ data }) {
  if (!data?.shares) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--gray-300)]">
            <th className="text-left py-2 px-3 font-medium text-[var(--gray-700)]">
              AGI threshold
            </th>
            <th className="text-right py-2 px-3 font-medium text-[var(--gray-700)]">
              Share of federal tax
            </th>
            <th className="text-right py-2 px-3 font-medium text-[var(--gray-700)]">
              Share of CA state tax
            </th>
            <th className="text-right py-2 px-3 font-medium text-[var(--gray-700)]">
              Ratio
            </th>
            <th className="text-right py-2 px-3 font-medium text-[var(--gray-700)]">
              Records
            </th>
          </tr>
        </thead>
        <tbody>
          {data.shares.map((row) => (
            <tr
              key={row.threshold}
              className="border-b border-[var(--gray-100)]"
            >
              <td className="py-2 px-3">
                &gt;${(row.threshold / 1e6).toFixed(row.threshold >= 1e6 ? 0 : 1)}M
              </td>
              <td className="text-right py-2 px-3">
                {(row.fed_share * 100).toFixed(1)}%
              </td>
              <td className="text-right py-2 px-3">
                {(row.state_share * 100).toFixed(1)}%
              </td>
              <td className="text-right py-2 px-3 font-semibold">
                {row.ratio?.toFixed(2)}x
              </td>
              <td className="text-right py-2 px-3 text-[var(--gray-400)]">
                {row.raw_records.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
