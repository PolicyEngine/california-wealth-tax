"use client";

import Slider from "@/app/components/Slider";
import { formatBillions } from "@/lib/format";
import { DEPARTURE_RESPONSE_MODES } from "@/lib/departureResponse";
import { INCOME_TAX_METHODS } from "@/lib/microModel";
import { WEALTH_TAX_PAYMENT_MODES } from "@/lib/calculator";

const SET_LABELS = {
  baseline: "Statutory",
  berkeley: "Berkeley",
  hoover: "Hoover",
};

function ToggleChip({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
        selected
          ? "border-[var(--teal-600)] bg-[var(--teal-700)] text-white"
          : "border-[var(--gray-300)] bg-white text-[var(--gray-700)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ title, children, note }) {
  return (
    <div className="space-y-2">
      {title && (
        <p className="text-sm font-semibold text-[var(--gray-700)]">{title}</p>
      )}
      {children}
      {note && <p className="text-xs leading-5 text-[var(--gray-500)]">{note}</p>}
    </div>
  );
}

function CampRow({ campSummaries, matches, onApplyFrom }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--gray-500)]">
      <span>Set as</span>
      {Object.entries(SET_LABELS).map(([key, label]) => {
        const selected = matches.includes(key);

        return (
          <button
            key={key}
            type="button"
            onClick={() => onApplyFrom(key)}
            className={`rounded-full border px-3 py-1.5 transition-colors ${
              selected
                ? "border-[var(--teal-600)] bg-[var(--teal-50)] text-[var(--teal-700)]"
                : "border-[var(--gray-300)] bg-white text-[var(--gray-600)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
            }`}
          >
            <span className="font-medium">{label}</span>
            <span className="text-[var(--gray-400)]">: {campSummaries[key]}</span>
          </button>
        );
      })}
    </div>
  );
}

const percent = (digits = 0) => (value) => `${(value * 100).toFixed(digits)}%`;

export default function AssumptionPanel({
  group,
  params,
  update,
  setParams,
  campSummaries,
  matches,
  onApplyFrom,
  context,
  onClose,
}) {
  const {
    residencyAdjustments,
    remainingResidentWealthB,
    modeledAdditionalDepartureShare,
    snapshotDate,
    allocationComparison = [],
  } = context;

  let body = null;

  switch (group.id) {
    case "residency":
      body = (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-[var(--gray-600)]">
            The statutory score keeps everyone Forbes listed in California on
            January 1, 2026. The first two sections are documented claims that
            someone was not a resident that day; the third covers people who
            were residents on January 1 but are reported or expected to leave.
            Larry Ellison is out of every base: Forbes lists him in Florida and
            both published estimates exclude him.
          </p>
          <div className="flex flex-wrap gap-2">
            <ToggleChip
              selected={params.residencyExclusionIds.length === residencyAdjustments.length}
              onClick={() =>
                setParams((prev) => ({
                  ...prev,
                  residencyExclusionIds: residencyAdjustments.map((a) => a.id),
                }))
              }
            >
              Remove all
            </ToggleChip>
            <ToggleChip
              selected={params.residencyExclusionIds.length === 0}
              onClick={() => setParams((prev) => ({ ...prev, residencyExclusionIds: [] }))}
            >
              Keep all
            </ToggleChip>
          </div>
          {[
            { key: "residency", title: "Contested residency", category: "residency" },
            { key: "pre", title: "Reported departures before January 1, 2026", category: "pre_snapshot_departure" },
            {
              key: "post",
              title: "Reported or planned departures after January 1, 2026",
              category: "post_snapshot_departure",
              note: "Rauh et al.'s Table 7, which marks three of the four unconfirmed. They owe the wealth tax either way; applying the claim counts their future California income tax as lost and keeps them out of the modeled migration response.",
            },
          ].map((section) => (
            <div key={section.key} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-500)]">
                {section.title}
              </p>
              {section.note && (
                <p className="text-xs leading-5 text-[var(--gray-500)]">{section.note}</p>
              )}
              {residencyAdjustments
                .filter((adjustment) => adjustment.category === section.category)
                .map((adjustment) => {
                  const excluded = params.residencyExclusionIds.includes(adjustment.id);

                  return (
                    <div
                      key={adjustment.id}
                      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
                        excluded
                          ? "border-[var(--teal-600)] bg-[var(--teal-50)]"
                          : "border-[var(--gray-200)] bg-white"
                      }`}
                    >
                      <span className="min-w-0 text-sm">
                        <span className="font-semibold text-[var(--gray-700)]">
                          {adjustment.name}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-[var(--gray-500)]">
                          {adjustment.summary}{" "}
                          {adjustment.sourceUrl && (
                            <a
                              href={adjustment.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-[var(--teal-600)] hover:text-[var(--teal-700)]"
                            >
                              Source
                            </a>
                          )}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setParams((prev) => ({
                            ...prev,
                            residencyExclusionIds: excluded
                              ? prev.residencyExclusionIds.filter((id) => id !== adjustment.id)
                              : [...prev.residencyExclusionIds, adjustment.id],
                          }))
                        }
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          !excluded
                            ? "border-[var(--teal-600)] bg-[var(--teal-700)] text-white"
                            : "border-[var(--gray-300)] bg-white text-[var(--gray-600)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                        }`}
                      >
                        {excluded
                          ? adjustment.category === "post_snapshot_departure"
                            ? "Income tax lost"
                            : "Removed"
                          : adjustment.category === "post_snapshot_departure"
                            ? "Still paying"
                            : "In the base"}
                      </button>
                    </div>
                  );
                })}
            </div>
          ))}
          <p className="text-xs leading-5 text-[var(--gray-500)]">
            California domicile turns on a closest-connection test, and none of
            these claims has been tested. Galle, Gamage, Saez and Shanske argue
            it is unlikely many of these people have taken the steps a change
            of residency requires; Rauh et al. treat all of theirs as
            effective.
          </p>
        </div>
      );
      break;

    case "migration": {
      const usesShare = params.departureResponseMode === DEPARTURE_RESPONSE_MODES.SHARE;

      body = (
        <div className="space-y-5">
          <Field
            title="How to set it"
            note="A share removes that fraction of the base the response can reach (everyone still in it, less people you marked as leaving after January 1) before the valuation date. A semi-elasticity sets the total share of the base that leaves, documented departures included, at 1 − exp(−ε × 0.05), and the calculator solves for the share of the reachable base that delivers it; Rauh et al. apply 10.32 per point linearly for 51.6%, which this kernel reaches at 14.5."
          >
            <div className="flex flex-wrap gap-2">
              <ToggleChip selected={usesShare} onClick={() => update("departureResponseMode", DEPARTURE_RESPONSE_MODES.SHARE)}>
                Share of remaining base
              </ToggleChip>
              <ToggleChip selected={!usesShare} onClick={() => update("departureResponseMode", DEPARTURE_RESPONSE_MODES.ELASTICITY)}>
                Semi-elasticity
              </ToggleChip>
            </div>
          </Field>
          {usesShare ? (
            <Slider
              label="Further wealth leaving before December 31, 2026"
              value={params.unannouncedDepartureShare}
              onChange={(value) => update("unannouncedDepartureShare", value)}
              min={0}
              max={0.8}
              step={0.01}
              format={(value) =>
                `${(value * 100).toFixed(0)}% · ${formatBillions(value * remainingResidentWealthB)}`
              }
              quickPicks={[
                { label: "None", value: 0 },
                { label: "Rauh et al.'s 51.6% total, as a share", value: 0.5 },
              ]}
            />
          ) : (
            <Slider
              label="Semi-elasticity per percentage point"
              value={params.migrationSemiElasticity}
              onChange={(value) => update("migrationSemiElasticity", value)}
              min={0}
              max={30}
              step={0.1}
              format={(value) =>
                `${value.toFixed(2)} · ${(modeledAdditionalDepartureShare * 100).toFixed(1)}% of the reachable base`
              }
              quickPicks={[
                { label: "None", value: 0 },
                { label: "Rauh et al.'s literature calibration, 10.32 (from Brülhart et al.)", value: 10.32 },
                { label: "Rauh et al.'s 51.6% total in this kernel: 14.5", value: 14.5 },
              ]}
            />
          )}
          <p className="text-xs leading-5 text-[var(--gray-500)]">
            Published semi-elasticities describe permanent annual wealth taxes.
            A one-time 5% levy has the same present value as a permanent tax of
            0.075 to 0.225 points a year at real rates of 1.5% to 4.5%, which at
            10.32 per point implies a 0.8% to 2.3% base loss. The 51.6% figure
            follows if taxpayers expect the levy to recur indefinitely; what
            people expect is the parameter in dispute.
          </p>
        </div>
      );
      break;
    }

    case "incomeTax":
      body = (
        <div className="space-y-5">
          <Field
            title="Count the income tax movers would have paid?"
            note="Stage two attributes future California income tax of people who leave to the measure. Both sides agree this is where the sign is decided; they disagree on how much income tax the movers pay and for how long."
          >
            <div className="flex flex-wrap gap-2">
              <ToggleChip selected={params.includeIncomeTaxEffects} onClick={() => update("includeIncomeTaxEffects", true)}>
                Count it
              </ToggleChip>
              <ToggleChip selected={!params.includeIncomeTaxEffects} onClick={() => update("includeIncomeTaxEffects", false)}>
                Wealth tax only
              </ToggleChip>
            </div>
          </Field>
          {params.includeIncomeTaxEffects && (
            <>
              <Slider
                label="Share of movers' lost income tax caused by the measure"
                value={params.incomeTaxAttributionRate}
                onChange={(value) => update("incomeTaxAttributionRate", value)}
                min={0}
                max={1}
                step={0.05}
                format={percent(0)}
              />
              <Slider
                label="Years of lost income tax"
                value={params.horizonYears === Infinity ? 100 : params.horizonYears}
                onChange={(value) => update("horizonYears", value >= 100 ? Infinity : value)}
                min={5}
                max={100}
                step={5}
                format={(value) => (value >= 100 ? "Perpetuity" : `${value} years`)}
                quickPicks={[
                  { label: "10 years", value: 10 },
                  { label: "25 years", value: 25 },
                  { label: "Perpetuity", value: 100 },
                ]}
              />
              <Slider
                label="Real growth of the lost income-tax stream"
                value={params.incomeGrowthRate}
                onChange={(value) => update("incomeGrowthRate", value)}
                min={-0.05}
                max={0.05}
                step={0.005}
                format={(value) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}% a year`}
                quickPicks={[
                  { label: "Flat in real terms", value: 0 },
                  { label: "+1.5%", value: 0.015 },
                  { label: "−1.5%", value: -0.015 },
                ]}
              />
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                With the discount rate, this sets r − g for the perpetuity.
                Rauh et al. report results at r − g of 1.5%, 3% and 4.5%.
              </p>
              <Slider
                label="Share of movers who return each year"
                value={params.annualReturnRate}
                onChange={(value) => update("annualReturnRate", value)}
                min={0}
                max={0.5}
                step={0.01}
                format={percent(0)}
              />
            </>
          )}
        </div>
      );
      break;

    case "incomeAllocation": {
      const method = params.incomeTaxMethod;
      const usesCohortTotal = method !== INCOME_TAX_METHODS.YIELD;

      body = (
        <div className="space-y-5">
          <p className="text-sm leading-6 text-[var(--gray-600)]">
            The two teams agree on roughly how much California income tax the
            state&apos;s billionaires pay in total: Rauh et al. estimate $3.3B to
            $5.8B a year from Franchise Tax Board data, and Boll, Saez and
            Zucman estimate $4.3B for 2025. They disagree about who pays it,
            and that decides how much leaves with the people who move.
          </p>
          <Field title="How the total is divided">
            <div className="flex flex-wrap gap-2">
              <ToggleChip
                selected={method === INCOME_TAX_METHODS.FILINGS}
                onClick={() => update("incomeTaxMethod", INCOME_TAX_METHODS.FILINGS)}
              >
                Filings for the four largest, wealth for the rest
              </ToggleChip>
              <ToggleChip
                selected={method === INCOME_TAX_METHODS.WEALTH}
                onClick={() => update("incomeTaxMethod", INCOME_TAX_METHODS.WEALTH)}
              >
                By wealth (Rauh et al.)
              </ToggleChip>
              <ToggleChip
                selected={method === INCOME_TAX_METHODS.YIELD}
                onClick={() => update("incomeTaxMethod", INCOME_TAX_METHODS.YIELD)}
              >
                Uniform yield on wealth
              </ToggleChip>
            </div>
          </Field>
          {usesCohortTotal ? (
            <Slider
              label="California income tax paid by the cohort, a year"
              value={params.cohortIncomeTaxB}
              onChange={(value) => update("cohortIncomeTaxB", value)}
              min={1}
              max={8}
              step={0.05}
              format={(value) => `$${value.toFixed(2)}B`}
              quickPicks={[
                { label: "Rauh low $3.3B", value: 3.3 },
                { label: "Boll–Saez–Zucman 2025 $4.3B", value: 4.3 },
                { label: "Rauh midpoint $4.55B", value: 4.55 },
                { label: "Rauh high $5.8B", value: 5.8 },
              ]}
            />
          ) : (
            <Slider
              label="Taxable income as a share of wealth"
              value={params.incomeYieldRate}
              onChange={(value) => update("incomeYieldRate", value)}
              min={0.001}
              max={0.05}
              step={0.001}
              format={percent(1)}
            />
          )}
          {allocationComparison.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--gray-200)] text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-500)]">
                    <th className="py-2 pr-4">California income tax a year</th>
                    <th className="px-2 py-2 text-right">Share of cohort wealth</th>
                    <th className="px-2 py-2 text-right">If divided by wealth</th>
                    <th className="px-2 py-2 text-right">From SEC filings</th>
                  </tr>
                </thead>
                <tbody>
                  {allocationComparison.map((row) => (
                    <tr key={row.name} className="border-b border-[var(--gray-100)]">
                      <td className="py-2 pr-4 font-medium text-[var(--gray-700)]">{row.name}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{(row.wealthShare * 100).toFixed(1)}%</td>
                      <td className="px-2 py-2 text-right tabular-nums">${(row.byWealthB * 1000).toFixed(0)}M</td>
                      <td className="px-2 py-2 text-right tabular-nums">${(row.filingsB * 1000).toFixed(0)}M</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs leading-5 text-[var(--gray-500)]">
            Filings figures are Boll, Saez and Zucman&apos;s estimates from SEC
            disclosures of stock sales, donations and option exercises plus
            dividends and compensation, averaged over 2023–2025 (their Table 3).
            Founders whose wealth is unrealized stock report little taxable
            income relative to it. Dividing the total by wealth instead is Rauh
            et al.&apos;s f × C: a mover&apos;s loss is their wealth share of the
            cohort total. The uniform yield is kept for older links; Rauh et
            al. back out 1.3% to 2.3% on their 2025 list, and on today&apos;s
            larger roster a 2% yield puts the cohort above both teams&apos;
            totals.
          </p>
        </div>
      );
      break;
    }

    case "erosion":
      body = (
        <div className="space-y-4">
          <Slider
            label="Haircut on one-time receipts"
            value={params.avoidanceRate}
            onChange={(value) => update("avoidanceRate", value)}
            min={0}
            max={0.5}
            step={0.01}
            format={percent(0)}
            quickPicks={[
              { label: "None", value: 0 },
              { label: "Berkeley 10%", value: 0.1 },
            ]}
          />
          <p className="text-xs leading-5 text-[var(--gray-500)]">
            A reduced-form allowance for avoidance, evasion, and the gap
            between Forbes estimates and values reported to the Franchise Tax
            Board. It lowers one-time receipts only; it does not move anyone or
            create future income-tax losses. Galle et al. apply 10%; Rauh et
            al. apply none and reduce the base through residency and migration
            instead. Boll, Saez and Zucman&apos;s 23% scenario is mostly four
            departures, which belong in the residency panel. The measure&apos;s
            valuation rules (no minority discounts, a funding-round floor, and a
            presumed value of book value plus 7.5 times three-year average
            profits for private businesses, rebuttable on clear and convincing
            evidence) push in both directions.
          </p>
        </div>
      );
      break;

    case "valuation":
      body = (
        <div className="space-y-5">
          <Field
            title="Directly held real estate"
            note="The measure excludes real property held directly or through a revocable trust (RTC §50303(c)(4)); real estate held through a business stays in. As measured here the exclusion is about 0.35% of the base and a lower bound: the data record personal residences. The Berkeley estimate leaves it in."
          >
            <div className="flex flex-wrap gap-2">
              <ToggleChip selected={params.excludeRealEstate} onClick={() => update("excludeRealEstate", true)}>
                Exclude it
              </ToggleChip>
              <ToggleChip selected={!params.excludeRealEstate} onClick={() => update("excludeRealEstate", false)}>
                Include it
              </ToggleChip>
            </div>
          </Field>
          <Slider
            label={`Wealth growth from the ${snapshotDate} snapshot to December 31, 2026 (annual, nominal)`}
            value={params.wealthGrowthRate}
            onChange={(value) => update("wealthGrowthRate", value)}
            min={-0.3}
            max={0.3}
            step={0.005}
            format={(value) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`}
            quickPicks={[
              { label: "Hold at snapshot", value: 0 },
              { label: "−20%", value: -0.2 },
              { label: "+7.5% (historical)", value: 0.075 },
            ]}
          />
          <p className="text-xs leading-5 text-[var(--gray-500)]">
            The tax is on net worth at December 31, 2026. Day-to-day movement
            of the California base has a standard deviation of about 0.9%, so
            one standard deviation over the months to the valuation date is
            roughly ±9%; four people hold about 40% of the base.
          </p>
        </div>
      );
      break;

    case "timing":
      body = (
        <div className="space-y-5">
          <Slider
            label="Real discount rate"
            value={params.discountRate}
            onChange={(value) => update("discountRate", value)}
            min={0}
            max={0.05}
            step={0.005}
            format={percent(1)}
            quickPicks={[
              { label: "1.5%", value: 0.015 },
              { label: "3%", value: 0.03 },
              { label: "4.5%", value: 0.045 },
            ]}
          />
          <p className="text-xs leading-5 text-[var(--gray-500)]">
            Applied to receipts (first due with 2026 returns in 2027) and to
            the income-tax loss stream, which starts the same year. Rauh et
            al. use 1.5% to 4.5%.
          </p>
          <Field
            title="Payment"
            note="Installments carry a 7.5% nondeductible charge on the unpaid balance (RTC §50301(c)): $115 per $100 of liability in nominal receipts, and more in present value at any discount rate below 7.5%."
          >
            <div className="flex flex-wrap gap-2">
              <ToggleChip
                selected={params.wealthTaxPaymentMode === WEALTH_TAX_PAYMENT_MODES.LUMP_SUM}
                onClick={() => update("wealthTaxPaymentMode", WEALTH_TAX_PAYMENT_MODES.LUMP_SUM)}
              >
                Lump sum in 2027
              </ToggleChip>
              <ToggleChip
                selected={params.wealthTaxPaymentMode === WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS}
                onClick={() => update("wealthTaxPaymentMode", WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS)}
              >
                Five installments, 2027–2031
              </ToggleChip>
            </div>
          </Field>
        </div>
      );
      break;

    default:
      body = null;
  }

  return (
    <section
      id={`panel-${group.id}`}
      className="space-y-5 rounded-[30px] border border-[var(--teal-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--gray-700)]">
          {group.label}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[var(--gray-300)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--gray-600)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
        >
          Close
        </button>
      </div>
      <CampRow campSummaries={campSummaries} matches={matches} onApplyFrom={onApplyFrom} />
      {body}
    </section>
  );
}
