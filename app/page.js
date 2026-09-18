"use client";

import { useEffect, useMemo, useState } from "react";
import AssumptionPanel from "@/app/components/AssumptionPanels";
import BillionaireTable from "@/app/components/BillionaireTable";
import Heatmap from "@/app/components/Heatmap";
import LiveBridge from "@/app/components/LiveBridge";
import ResultStrip from "@/app/components/ResultStrip";
import { ASSUMPTION_GROUPS, ASSUMPTION_GROUP_BY_ID, scenarioBridge } from "@/lib/bridge";
import { WEALTH_TAX_PAYMENT_MODES } from "@/lib/calculator";
import { DEPARTURE_RESPONSE_MODES } from "@/lib/departureResponse";
import { formatBillions } from "@/lib/format";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
} from "@/lib/microModel";
import {
  BASELINE_ASSUMPTIONS,
  BERKELEY_ASSUMPTIONS,
  HOOVER_ASSUMPTIONS,
} from "@/lib/presets";
import {
  normalizeResidencyExclusionIds,
  RESIDENCY_ADJUSTMENTS,
  RESIDENCY_ROSTER_DATE,
} from "@/lib/residencyAdjustments";
import { scoreScenario } from "@/lib/scenario";
import { buildScenarioHref, parseScenarioParams } from "@/lib/scenarioUrl";
import billionaireMetadata from "@/data/billionaire_metadata.json";
import incomeTaxLookup from "@/data/income_tax_lookup.json";
import rauhData from "@/data/billionaires_rauh.json";
import liveData from "@/data/billionaires_live.json";
import liveMetadata from "@/data/billionaires_live_meta.json";
import rosterValuations from "@/data/roster_valuations.json";
import snapshotIndex from "@/public/snapshots/index.json";
import residencyRosterData from "@/public/snapshots/2026-01-01.json";

const BALLOT_MEASURE_URL =
  "https://oag.ca.gov/system/files/initiatives/pdfs/25-0024A1%20%28Billionaire%20Tax%20%29.pdf";
const LAO_ANALYSIS_URL =
  "https://lao.ca.gov/BallotAnalysis/Proposition?number=40&year=2026";
// next.config.mjs mounts the app under this path; raw fetch() does not apply
// basePath, so it is prepended by hand, as layout.js does for the logo.
const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : "/us/california-wealth-tax";
const LIVE_DATE = snapshotIndex[snapshotIndex.length - 1];
const PAPER_DATE = "2025-10-17";
const BUNDLED_SNAPSHOTS = {
  [PAPER_DATE]: rauhData,
  [RESIDENCY_ROSTER_DATE]: residencyRosterData,
  [LIVE_DATE]: liveData,
};
const LIVE_SNAPSHOT_TIMESTAMP_LABEL = liveMetadata.sourceTimestampIso
  ? new Date(liveMetadata.sourceTimestampIso).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    })
  : null;
const ASSUMPTION_SETS = {
  baseline: BASELINE_ASSUMPTIONS,
  berkeley: BERKELEY_ASSUMPTIONS,
  hoover: HOOVER_ASSUMPTIONS,
};
const SET_LABELS = {
  baseline: "PolicyEngine baseline",
  berkeley: "Berkeley",
  hoover: "Hoover",
};
const DEFAULT_PARAMS = { snapshotDate: LIVE_DATE, ...BASELINE_ASSUMPTIONS };
const HEATMAP_SHARES = Array.from({ length: 17 }, (_, i) => i * 0.05);
const HEATMAP_YIELDS = Array.from({ length: 15 }, (_, i) => (i + 1) * 0.002);

function sameValue(a, b) {
  return Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((entry, index) => entry === b[index])
    : a === b;
}

function assumptionsOf(params) {
  const { snapshotDate, ...assumptions } = params;
  void snapshotDate;
  return assumptions;
}

function normalizeParams(nextParams) {
  return {
    ...nextParams,
    residencyExclusionIds: normalizeResidencyExclusionIds(
      nextParams.residencyExclusionIds ?? []
    ),
  };
}

function getSnapshotRows(snapshotDate, data) {
  return annotateBillionaires({
    billionaires: data,
    metadata: billionaireMetadata,
    snapshotDate,
  });
}

function resolveSnapshotDate(requestedDate) {
  if (!requestedDate) {
    return LIVE_DATE;
  }

  if (snapshotIndex.includes(requestedDate)) {
    return requestedDate;
  }

  let resolvedDate = snapshotIndex[0];

  for (const candidateDate of snapshotIndex) {
    if (candidateDate > requestedDate) {
      break;
    }
    resolvedDate = candidateDate;
  }

  return resolvedDate;
}

function canonicalScenarioPathname(pathname) {
  return pathname.endsWith("/embed")
    ? pathname.slice(0, -"/embed".length) || "/"
    : pathname;
}

function groupMatchesSet(group, assumptions, set) {
  return group.keys.every((key) => sameValue(assumptions[key], set[key]));
}

function summarizeGroup(group, assumptions, context) {
  switch (group.id) {
    case "residency": {
      const count = assumptions.residencyExclusionIds.length;
      return count === 0
        ? "Everyone stays: no departure claim treated as effective"
        : `${count} of ${RESIDENCY_ADJUSTMENTS.length} documented departure claims treated as effective`;
    }
    case "migration":
      return assumptions.departureResponseMode === DEPARTURE_RESPONSE_MODES.ELASTICITY
        ? `Semi-elasticity ${assumptions.migrationSemiElasticity.toFixed(1)} per point`
        : assumptions.unannouncedDepartureShare === 0
          ? "No further departures before the valuation date"
          : `${(assumptions.unannouncedDepartureShare * 100).toFixed(0)}% of the remaining base leaves (${formatBillions(assumptions.unannouncedDepartureShare * context.remainingResidentWealthB)})`;
    case "incomeTax":
      return assumptions.includeIncomeTaxEffects
        ? `Counted: income ${(assumptions.incomeYieldRate * 100).toFixed(1)}% of wealth, ${(assumptions.incomeTaxAttributionRate * 100).toFixed(0)}% attributed, ${assumptions.horizonYears === Infinity ? "in perpetuity" : `${assumptions.horizonYears} years`}${assumptions.incomeGrowthRate !== 0 ? `, ${assumptions.incomeGrowthRate > 0 ? "+" : ""}${(assumptions.incomeGrowthRate * 100).toFixed(1)}% real growth` : ""}${assumptions.annualReturnRate > 0 ? `, ${(assumptions.annualReturnRate * 100).toFixed(0)}% return a year` : ""}`
        : "Wealth tax only";
    case "erosion":
      return assumptions.avoidanceRate === 0
        ? "No haircut"
        : `${(assumptions.avoidanceRate * 100).toFixed(0)}% haircut on receipts`;
    case "valuation":
      return `${assumptions.excludeRealEstate ? "Real estate excluded" : "Real estate included"}; ${assumptions.wealthGrowthRate === 0 ? "wealth held at the snapshot" : `${assumptions.wealthGrowthRate > 0 ? "+" : ""}${(assumptions.wealthGrowthRate * 100).toFixed(1)}% a year to valuation`}`;
    case "timing":
      return `${(assumptions.discountRate * 100).toFixed(1)}% real discount; ${assumptions.wealthTaxPaymentMode === WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS ? "five installments" : "lump sum in 2027"}`;
    default:
      return "";
  }
}

function BaseNotes({ notes, peopleInBase }) {
  const lines = [];

  if (notes.assumedResidencyCount > 0) {
    lines.push(
      `${notes.assumedResidencyCount} people (${formatBillions(notes.assumedResidencyWealthB)}) are on Forbes' California list now and were not on its January 1, 2026 list, most of them added with Forbes' annual list in March. They are assumed to have been California residents on January 1.`
    );
  }

  if (notes.anyStateValuedCount > 0) {
    lines.push(
      `${notes.anyStateValuedCount} people (${formatBillions(notes.anyStateValuedWealthB)}) were on Forbes' California list on January 1, 2026 and are listed elsewhere now. They stay in the base at their current Forbes worth unless removed under residency.`
    );
  }

  if (notes.lastListedCount > 0) {
    lines.push(
      `${notes.lastListedCount} people (${formatBillions(notes.lastListedWealthB)}) from the January 1 list are no longer on any Forbes list. They are carried at the last positive value in the stored daily Forbes history.`
    );
  }

  if (notes.belowThresholdCount > 0) {
    lines.push(
      `${notes.belowThresholdCount} people are under $1 billion and out of the base${
        notes.belowThresholdCount > notes.belowThresholdOnForbesValueCount
          ? `, ${notes.belowThresholdCount - notes.belowThresholdOnForbesValueCount} of them only once directly held real estate is removed`
          : ""
      }.`
    );
  }

  if (notes.offForbesListCount > 0) {
    lines.push(
      `${notes.offForbesListCount} people from the January 1 list have no Forbes valuation and are out of the base.`
    );
  }

  if (notes.frozenRosterCount > 0) {
    lines.push(
      `${notes.frozenRosterCount} people (${formatBillions(notes.frozenRosterWealthB)}) are missing from this snapshot and are carried at their January 1, 2026 value.`
    );
  }

  lines.push(
    "Forbes leaves the state blank for most non-US citizens. Galle, Gamage, Saez and Shanske count 24 such California residents holding about $150 billion; they are not in this base."
  );

  return (
    <ul className="space-y-2 text-xs leading-5 text-[var(--gray-500)]">
      <li>{peopleInBase} people are in the tax base under the current assumptions.</li>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function DerivationRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span>{label}</span>
      <span className="font-semibold text-[var(--gray-700)]">{value}</span>
    </div>
  );
}

export default function Home() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [hasSyncedUrlState, setHasSyncedUrlState] = useState(false);
  const [activeTab, setActiveTab] = useState("calculator");
  const [activeGroup, setActiveGroup] = useState(null);
  const [bridgeFrom, setBridgeFrom] = useState("berkeley");
  const [bridgeTo, setBridgeTo] = useState("hoover");
  const [copyStatus, setCopyStatus] = useState("idle");
  const [snapshotData, setSnapshotData] = useState(
    BUNDLED_SNAPSHOTS[params.snapshotDate] ?? liveData
  );

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const parsed = normalizeParams(parseScenarioParams(searchParams, DEFAULT_PARAMS));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from the URL after mount; window is unavailable during render
    setParams(parsed);
    setHasSyncedUrlState(true);
    if (searchParams.toString().length > 0) {
      setBridgeTo("your");
    }
  }, []);

  useEffect(() => {
    if (!hasSyncedUrlState) {
      return;
    }

    const nextHref = buildScenarioHref(window.location.pathname, params, DEFAULT_PARAMS);
    const currentHref = `${window.location.pathname}${window.location.search}`;

    if (nextHref !== currentHref) {
      window.history.replaceState(null, "", nextHref);
    }
  }, [hasSyncedUrlState, params]);

  useEffect(() => {
    const date = params.snapshotDate;
    if (BUNDLED_SNAPSHOTS[date]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the bundled snapshot is synchronous; the fetch below is not
      setSnapshotData(BUNDLED_SNAPSHOTS[date]);
      return;
    }
    let stale = false;
    fetch(`${BASE_PATH}/snapshots/${date}.json`)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`snapshot ${date}: HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((rows) => {
        if (!stale) {
          setSnapshotData(rows);
        }
      })
      .catch(() => {
        // Never show another date's rows under this date's label.
        if (!stale) {
          setSnapshotData(null);
        }
      });
    return () => {
      stale = true;
    };
  }, [params.snapshotDate]);

  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }

    const timeout = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const residencySnapshotRows = useMemo(
    () => getSnapshotRows(RESIDENCY_ROSTER_DATE, residencyRosterData),
    []
  );
  const snapshotRows = useMemo(
    () =>
      buildResidencyRosterValuationRows({
        residencyRows: residencySnapshotRows,
        valuationRows: getSnapshotRows(params.snapshotDate, snapshotData),
        // The all-states valuations are fetched with the live snapshot and
        // describe that date only.
        rosterValuations:
          params.snapshotDate === LIVE_DATE && rosterValuations.sourceDate === LIVE_DATE
            ? rosterValuations
            : null,
        // People on the California list now but not on the January 1 list owe the tax if
        // they were residents that day; before the roster date the concept
        // does not apply.
        includeNewEntrants: params.snapshotDate > RESIDENCY_ROSTER_DATE,
      }),
    [residencySnapshotRows, params.snapshotDate, snapshotData]
  );
  const sourceDate = useMemo(
    () => new Date(`${params.snapshotDate}T00:00:00`),
    [params.snapshotDate]
  );
  const score = useMemo(
    () => (assumptions) =>
      scoreScenario({ params: assumptions, rows: snapshotRows, incomeTaxLookup, sourceDate }),
    [snapshotRows, sourceDate]
  );
  const assumptions = useMemo(() => assumptionsOf(params), [params]);
  const current = useMemo(() => score(assumptions), [score, assumptions]);
  const campValues = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(ASSUMPTION_SETS).map(([key, set]) => [
          key,
          score(set).result.netFiscalImpact,
        ])
      ),
    [score]
  );
  const endpointAssumptions = (key) =>
    key === "your" ? assumptions : ASSUMPTION_SETS[key];
  const bridge = useMemo(
    () =>
      scenarioBridge({
        start: endpointAssumptions(bridgeFrom),
        end: endpointAssumptions(bridgeTo),
        score,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bridgeFrom, bridgeTo, assumptions, score]
  );
  const activeSet =
    Object.keys(ASSUMPTION_SETS).find((key) =>
      ASSUMPTION_GROUPS.every((group) =>
        groupMatchesSet(group, assumptions, ASSUMPTION_SETS[key])
      )
    ) ?? null;
  const remainingResidentWealthB = current.baseMicro.stayers.reduce(
    (sum, row) => sum + row.netWorthB,
    0
  );
  const summaryContext = { remainingResidentWealthB };
  const groupSummaries = Object.fromEntries(
    ASSUMPTION_GROUPS.map((group) => [
      group.id,
      summarizeGroup(group, assumptions, summaryContext),
    ])
  );
  const groupMatches = Object.fromEntries(
    ASSUMPTION_GROUPS.map((group) => [
      group.id,
      Object.keys(ASSUMPTION_SETS).filter((key) =>
        groupMatchesSet(group, assumptions, ASSUMPTION_SETS[key])
      ),
    ])
  );
  const referenceLines = [];
  if (bridgeFrom !== "your" && bridgeTo !== "your") {
    referenceLines.push({
      label: "Your scenario",
      value: current.result.netFiscalImpact,
      stroke: "var(--gray-700)",
    });
  }
  if (bridgeFrom !== "baseline" && bridgeTo !== "baseline") {
    referenceLines.push({
      label: "Baseline",
      value: campValues.baseline,
      stroke: "var(--gray-400)",
    });
  }
  const heatmapEvaluate = useMemo(
    () => (share, yieldRate) =>
      score({
        ...assumptions,
        includeIncomeTaxEffects: true,
        departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
        unannouncedDepartureShare: share,
        incomeYieldRate: yieldRate,
      }).result.netFiscalImpact,
    [score, assumptions]
  );
  const heatmapMarks = [
    { label: "Hoover", share: HOOVER_ASSUMPTIONS.unannouncedDepartureShare, yieldRate: HOOVER_ASSUMPTIONS.incomeYieldRate },
  ];
  if (
    assumptions.includeIncomeTaxEffects &&
    assumptions.departureResponseMode === DEPARTURE_RESPONSE_MODES.SHARE &&
    activeSet !== "hoover"
  ) {
    heatmapMarks.push({
      label: "Your scenario",
      share: Math.min(assumptions.unannouncedDepartureShare, HEATMAP_SHARES.at(-1)),
      yieldRate: Math.min(Math.max(assumptions.incomeYieldRate, HEATMAP_YIELDS[0]), HEATMAP_YIELDS.at(-1)),
    });
  }

  const snapshotLabel =
    params.snapshotDate === LIVE_DATE
      ? LIVE_SNAPSHOT_TIMESTAMP_LABEL
        ? `Forbes as of ${LIVE_SNAPSHOT_TIMESTAMP_LABEL}`
        : `Forbes as of ${LIVE_DATE}`
      : params.snapshotDate === PAPER_DATE
        ? "Forbes list of October 17, 2025, the one both papers scored"
        : `Forbes snapshot of ${params.snapshotDate}`;
  const pitEffectsEnabled = params.includeIncomeTaxEffects;
  const embedBasePath =
    typeof window === "undefined"
      ? "/us/california-wealth-tax"
      : window.location.pathname.replace(/\/$/, "");
  const paperWebHref = `${embedBasePath}/papers/web/index.html`;
  const paperPdfHref = `${embedBasePath}/papers/california-wealth-tax-ssrn-draft.pdf`;

  function markEdited() {
    if (bridgeTo !== "your" && bridgeFrom !== "your") {
      setBridgeTo("your");
    }
  }

  function update(key, value) {
    setParams((prev) => normalizeParams({ ...prev, [key]: value }));
    markEdited();
  }

  function updateParams(updater) {
    setParams((prev) => normalizeParams(updater(prev)));
    markEdited();
  }

  function applySet(key) {
    setParams((prev) => normalizeParams({ ...prev, ...ASSUMPTION_SETS[key] }));
    markEdited();
  }

  function applyGroupFrom(groupId, setKey) {
    const group = ASSUMPTION_GROUP_BY_ID.get(groupId);

    setParams((prev) =>
      normalizeParams({
        ...prev,
        ...Object.fromEntries(group.keys.map((key) => [key, ASSUMPTION_SETS[setKey][key]])),
      })
    );
    markEdited();
  }

  async function copyScenarioLink() {
    try {
      const url = new URL(window.location.href);
      url.pathname = canonicalScenarioPathname(url.pathname);
      await navigator.clipboard.writeText(url.toString());
      setCopyStatus("Copied link");
    } catch {
      setCopyStatus("Copy failed");
    }
  }

  const dataControl = (
    <label className="inline-flex items-center gap-2 text-sm text-[var(--gray-600)]">
      <span>Data</span>
      <select
        value={
          params.snapshotDate === LIVE_DATE
            ? "live"
            : params.snapshotDate === PAPER_DATE
              ? "paper"
              : "other"
        }
        onChange={(event) => {
          const value = event.target.value;
          const nextDate =
            value === "live"
              ? LIVE_DATE
              : value === "paper"
                ? PAPER_DATE
                : resolveSnapshotDate("2026-03-30");
          setParams((prev) => normalizeParams({ ...prev, snapshotDate: nextDate }));
        }}
        className="rounded-full border border-[var(--gray-300)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--gray-700)]"
      >
        <option value="live">Forbes today ({LIVE_DATE})</option>
        <option value="paper">October 17, 2025 list (both papers)</option>
        <option value="other">Another stored date</option>
      </select>
      {params.snapshotDate !== LIVE_DATE && params.snapshotDate !== PAPER_DATE && (
        <input
          type="date"
          value={params.snapshotDate}
          min={snapshotIndex[0]}
          max={LIVE_DATE}
          onChange={(event) =>
            setParams((prev) =>
              normalizeParams({
                ...prev,
                snapshotDate: resolveSnapshotDate(event.target.value),
              })
            )
          }
          className="rounded-full border border-[var(--gray-300)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--gray-700)]"
        />
      )}
    </label>
  );

  const activeGroupConfig = activeGroup ? ASSUMPTION_GROUP_BY_ID.get(activeGroup) : null;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <main className="mx-auto max-w-6xl p-6">
        <div className="space-y-8">
          <section className="rounded-[30px] border border-[var(--gray-200)] bg-white px-6 py-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-3xl">
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--gray-700)]">
                  California Proposition 40 billionaire tax calculator
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--gray-500)]">
                  Proposition 40, on the November 3, 2026 ballot, is a one-time
                  tax of 5% of the entire net worth of California residents (as
                  of January 1, 2026) worth $1 billion or more, valued December
                  31, 2026. This calculator scores it person by person from
                  Forbes data and shows what each contested assumption is
                  worth, including the ones behind the Berkeley and Hoover
                  estimates.
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <a href={BALLOT_MEASURE_URL} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[var(--gray-300)] bg-white px-3 py-1.5 font-medium text-[var(--gray-700)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]">
                    Measure text
                  </a>
                  <a href={LAO_ANALYSIS_URL} target="_blank" rel="noopener noreferrer" className="rounded-full border border-[var(--gray-300)] bg-white px-3 py-1.5 font-medium text-[var(--gray-700)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]">
                    LAO analysis
                  </a>
                  <span className="rounded-full border border-[var(--gray-200)] bg-[var(--gray-50)] px-3 py-1.5 text-[var(--gray-500)]">
                    Propositions 41 and 42 on the same ballot can block it if either gets more yes votes
                  </span>
                </div>
              </div>
              <div className="inline-flex rounded-full border border-[var(--gray-200)] bg-[var(--gray-50)] p-1">
                {[
                  { key: "calculator", label: "Calculator" },
                  { key: "paper", label: "Paper" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab.key
                        ? "bg-[var(--teal-700)] text-white"
                        : "text-[var(--gray-600)] hover:bg-white hover:text-[var(--teal-700)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {activeTab === "paper" ? (
            <section className="space-y-5 rounded-[30px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
                    Working paper
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
                    The paper documents the model; every number in it is
                    computed by the calculator&apos;s code from a dated snapshot.
                  </p>
                </div>
                <a
                  href={paperPdfHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gray-300)] bg-white px-4 py-2 text-sm font-medium text-[var(--gray-700)] transition-colors hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                >
                  Open PDF
                </a>
              </div>
              <div className="overflow-hidden rounded-[24px] border border-[var(--gray-200)] bg-white">
                <iframe
                  title="California Proposition 40 working paper"
                  src={paperWebHref}
                  className="h-[78vh] min-h-[720px] w-full"
                />
              </div>
            </section>
          ) : (
            <>
              <ResultStrip
                headlineValue={current.result.headlineValue}
                headlineLabel={
                  pitEffectsEnabled
                    ? "Net fiscal impact, present value as of 2026"
                    : "One-time wealth-tax revenue"
                }
                headlineNote={
                  pitEffectsEnabled
                    ? `Wealth-tax receipts less attributed future California income-tax losses. Receipts go to a reserve fund that is legally separate from the General Fund, where income tax is collected. ${snapshotLabel}.`
                    : `Nominal receipts, first due with 2026 returns in 2027. Excludes future California income-tax losses. ${snapshotLabel}.`
                }
                presentValue={current.result.netFiscalImpact}
                campValues={campValues}
                activeSet={activeSet}
                onApplySet={applySet}
                copyStatus={copyStatus}
                onCopyLink={copyScenarioLink}
                dataControl={dataControl}
              />

              <LiveBridge
                bridge={bridge}
                from={bridgeFrom}
                to={bridgeTo}
                onChangeFrom={setBridgeFrom}
                onChangeTo={setBridgeTo}
                groups={ASSUMPTION_GROUPS}
                activeGroup={activeGroup}
                onSelectGroup={setActiveGroup}
                groupSummaries={groupSummaries}
                groupMatches={Object.fromEntries(
                  Object.entries(groupMatches).map(([id, keys]) => [
                    id,
                    keys.map((key) => SET_LABELS[key]),
                  ])
                )}
                referenceLines={referenceLines}
                snapshotDate={params.snapshotDate}
              />

              {activeGroupConfig && (
                <AssumptionPanel
                  key={activeGroupConfig.id}
                  group={activeGroupConfig}
                  params={params}
                  update={update}
                  setParams={updateParams}
                  campSummaries={Object.fromEntries(
                    Object.entries(ASSUMPTION_SETS).map(([key, set]) => [
                      key,
                      summarizeGroup(activeGroupConfig, set, summaryContext),
                    ])
                  )}
                  matches={groupMatches[activeGroupConfig.id]}
                  onApplyFrom={(setKey) => applyGroupFrom(activeGroupConfig.id, setKey)}
                  context={{
                    residencyAdjustments: RESIDENCY_ADJUSTMENTS,
                    remainingResidentWealthB,
                    modeledAdditionalDepartureShare: current.modeledAdditionalDepartureShare,
                    snapshotDate: params.snapshotDate,
                  }}
                  onClose={() => setActiveGroup(null)}
                />
              )}

              <section className="space-y-5 rounded-[30px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
                <div className="max-w-3xl">
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
                    The two assumptions that carry the spread
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
                    Net present value as of 2026 with income-tax effects counted,
                    across how much more wealth leaves before the valuation date
                    and how much taxable income the movers report relative to
                    their wealth. Other assumptions as in your scenario. Rauh et
                    al. sit at 48% and 2%; SEC filings put Page, Brin and
                    Zuckerberg near 0.3%; Boll, Saez and Zucman put all
                    California billionaires near 1.5%.
                  </p>
                </div>
                <Heatmap
                  evaluate={heatmapEvaluate}
                  shares={HEATMAP_SHARES}
                  yields={HEATMAP_YIELDS}
                  marks={heatmapMarks}
                />
              </section>

              <section className="space-y-5 rounded-[30px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
                      Who pays
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
                      Everyone Forbes listed in California on January 1, 2026,
                      valued at their latest Forbes worth wherever Forbes lists
                      them now, plus everyone Forbes has added to its California list since.
                    </p>
                  </div>
                  <details className="w-full max-w-md text-sm text-[var(--gray-600)] lg:w-auto">
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--gray-500)] hover:text-[var(--teal-700)]">
                      Derivation
                    </summary>
                    <div className="mt-2 divide-y divide-[var(--gray-100)]">
                      <DerivationRow label="Gross wealth tax (statutory rate)" value={formatBillions(current.result.grossWealthTaxB)} />
                      <DerivationRow label="After haircut" value={formatBillions(current.result.wealthTaxCollected)} />
                      {current.result.wealthTaxDeferralChargeB > 0 && (
                        <DerivationRow label="Installment deferral charges" value={formatBillions(current.result.wealthTaxDeferralChargeB)} />
                      )}
                      <DerivationRow label="Nominal receipts" value={formatBillions(current.result.wealthTaxNominalReceiptsB)} />
                      <DerivationRow label="Present value of receipts (2026)" value={formatBillions(current.result.pvWealthTaxReceipts)} />
                      {pitEffectsEnabled && (
                        <>
                          <DerivationRow label="Movers' income tax lost, attributed" value={`$${current.result.annualIncomeTaxLost.toFixed(2)}B a year`} />
                          <DerivationRow label="Present value of lost income tax" value={formatBillions(current.result.pvLostIncomeTax)} />
                        </>
                      )}
                      <DerivationRow label="Net present value" value={formatBillions(current.result.netFiscalImpact, { showPlus: true })} />
                    </div>
                  </details>
                </div>
                <BaseNotes notes={current.micro.baseNotes} peopleInBase={current.micro.wealthTaxBaseRows.length} />
                <BillionaireTable
                  rows={current.micro.rows}
                  avoidanceRate={params.avoidanceRate}
                  excludeRealEstate={params.excludeRealEstate}
                />
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
