"use client";

import EffectiveRatesChart from "@/app/components/EffectiveRatesChart";
import TaxSharesTable from "@/app/components/TaxSharesTable";

import effectiveRates from "@/data/effective_rates.json";
import progressivity from "@/data/progressivity.json";
import taxShares from "@/data/tax_shares.json";

export default function LTCGTab() {
  const ratio5m = taxShares.shares.find(
    (share) => share.threshold === 5_000_000
  )?.ratio;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-2">
          Why federal income tax shares understate CA billionaire contributions
        </h2>
        <p className="text-[var(--gray-600)] mb-4">
          California taxes long-term capital gains as ordinary income (up to
          13.3%), while the federal code gives LTCG a preferential rate (max
          23.8% vs 37% for wages). Since billionaire income is
          disproportionately LTCG, scaling a federal-derived ratio to CA
          understates their contribution. Saez et al. cite ~2.5% of CA income
          tax receipts as the billionaire share, derived from federal data. Our
          analysis suggests the true figure is closer to 3.5%.
        </p>
      </div>

      <div>
        <h3 className="text-base font-semibold mb-3">
          CA tax / federal tax ratio by income type
        </h3>
        <p className="text-sm text-[var(--gray-600)] mb-3">
          At $100M income, a wage earner pays 36% as much CA tax as federal tax.
          A capital gains earner pays 56% because CA doesn&apos;t discount LTCG.
        </p>
        <EffectiveRatesChart data={effectiveRates} />
      </div>

      <div>
        <h3 className="text-base font-semibold mb-3">
          Tax share by AGI threshold (CA filers, 2026)
        </h3>
        <p className="text-sm text-[var(--gray-600)] mb-3">
          Among CA filers with AGI above $5M, they pay{" "}
          {ratio5m ? `${ratio5m.toFixed(2)}x` : "more"} as much of CA state
          income tax as they do of federal income tax.
        </p>
        <TaxSharesTable data={taxShares} />
      </div>

      <div>
        <h3 className="text-base font-semibold mb-3">
          Is CA&apos;s income tax more progressive than federal?
        </h3>
        <p className="text-sm text-[var(--gray-600)]">
          Measuring progressivity as Gini reduction per dollar of revenue
          (stripping out federal and state refundable tax credits), CA&apos;s rate
          structure is{" "}
          <span className="font-semibold">
            {progressivity.progressivity_ratio.toFixed(2)}x
          </span>{" "}
          as progressive as the federal rate structure per dollar collected. The
          federal system achieves{" "}
          {progressivity.fed_gini_per_trillion.toFixed(4)} Gini points of
          reduction per $1T of revenue, while CA achieves{" "}
          {progressivity.state_gini_per_trillion.toFixed(4)}.
        </p>
      </div>

      <div className="border-t border-[var(--gray-300)] pt-4">
        <h3 className="text-sm font-semibold text-[var(--gray-700)] mb-2">
          Sources and methodology
        </h3>
        <ul className="text-xs text-[var(--gray-600)] space-y-1">
          <li>
            Tax shares computed using PolicyEngine&apos;s CA-calibrated enhanced CPS
            microsimulation (2026 tax year).
          </li>
          <li>
            Effective rates from individual PolicyEngine household simulations
            (single filer, CA, 2026).
          </li>
          <li>
            Progressivity measured as change in Gini coefficient when each tax is
            removed, normalized by revenue. Federal and California refundable
            credits are excluded to isolate rate structure progressivity.
          </li>
          <li>
            Replication notebook:{" "}
            <a
              href="https://gist.github.com/MaxGhenis/bbae835f25e3d07ce57b5e16b7ff170a"
              className="text-[var(--teal-600)] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub Gist
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}
