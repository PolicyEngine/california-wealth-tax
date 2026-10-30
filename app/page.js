"use client";

import { useDeferredValue, useEffect, useMemo, useReducer, useState } from "react";
import AssumptionPanel from "@/app/components/AssumptionPanels";
import BillionaireTable from "@/app/components/BillionaireTable";
import { BRIDGE_ENDPOINTS, BuildStep, CompareStep, StepTabs } from "@/app/components/LiveBridge";
import RelatedWork from "@/app/components/RelatedWork";
import ResultStrip, { ResultNotes, ScenarioActions } from "@/app/components/ResultStrip";
import {
  ASSUMPTION_GROUPS,
  ASSUMPTION_GROUP_BY_ID,
  closestSet,
  scenarioBridge,
} from "@/lib/bridge";
import { WEALTH_TAX_PAYMENT_MODES } from "@/lib/calculator";
import { DEPARTURE_RESPONSE_MODES } from "@/lib/departureResponse";
import { INCOME_TAX_METHODS, snapshotSourceDate } from "@/lib/microModel";
import { formatBillions, longDate } from "@/lib/format";
import { loadSnapshot, selectSnapshotRows, snapshotReducer } from "@/lib/snapshot";
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
  baseline: "Statutory",
  berkeley: "Berkeley",
  hoover: "Hoover",
};
const DEFAULT_PARAMS = { snapshotDate: LIVE_DATE, ...BASELINE_ASSUMPTIONS };
const FOUR_LARGEST = ["Larry Page", "Sergey Brin", "Mark Zuckerberg", "Jensen Huang"];

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

function matchingSetKey(assumptions) {
  return (
    Object.keys(ASSUMPTION_SETS).find((key) =>
      ASSUMPTION_GROUPS.every((group) =>
        groupMatchesSet(group, assumptions, ASSUMPTION_SETS[key])
      )
    ) ?? null
  );
}

function residentWealthB(scored) {
  return scored.baseMicro.stayers.reduce((sum, row) => sum + row.netWorthB, 0);
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
          ? "No unannounced departures before January 1"
          : `${(assumptions.unannouncedDepartureShare * 100).toFixed(0)}% of the reachable base left unannounced (${formatBillions(assumptions.unannouncedDepartureShare * context.remainingResidentWealthB)})`;
    case "incomeTax":
      return assumptions.includeIncomeTaxEffects
        ? `Counted: ${(assumptions.incomeTaxDepartureShare ?? 0) > 0 ? `at least ${((assumptions.incomeTaxDepartureShare) * 100).toFixed(0)}% of the cohort's income tax lost, ` : ""}${(assumptions.incomeTaxAttributionRate * 100).toFixed(0)}% attributed, ${assumptions.horizonYears === Infinity ? "in perpetuity" : `${assumptions.horizonYears} years`}${assumptions.incomeGrowthRate !== 0 ? `, ${assumptions.incomeGrowthRate > 0 ? "+" : ""}${(assumptions.incomeGrowthRate * 100).toFixed(1)}% real growth` : ""}${assumptions.annualReturnRate > 0 ? `, ${(assumptions.annualReturnRate * 100).toFixed(0)}% return a year` : ""}`
        : "Wealth tax only";
    case "incomeAllocation":
      return assumptions.incomeTaxMethod === INCOME_TAX_METHODS.YIELD
        ? `Uniform yield: income ${(assumptions.incomeYieldRate * 100).toFixed(1)}% of wealth`
        : `$${assumptions.cohortIncomeTaxB.toFixed(2)}B a year, ${assumptions.incomeTaxMethod === INCOME_TAX_METHODS.WEALTH ? "divided by wealth" : "filings for the four largest, the rest by wealth"}`;
    case "erosion":
      return assumptions.avoidanceRate === 0
        ? "No haircut"
        : `${(assumptions.avoidanceRate * 100).toFixed(0)}% haircut on receipts`;
    case "legal": {
      const parts = [
        assumptions.litigationSurvivalRate >= 1
          ? "Survives challenge"
          : `${(assumptions.litigationSurvivalRate * 100).toFixed(0)}% chance it survives`,
      ];
      if (!assumptions.collectFromPostSnapshotMovers) parts.push("later movers not collected");
      if (!assumptions.includeNonCitizens) parts.push("non-US citizens out");
      return parts.length === 1 && assumptions.litigationSurvivalRate >= 1
        ? "As written: survives, collects from everyone resident on January 1"
        : parts.join("; ");
    }
    case "valuation":
      return `${assumptions.excludeRealEstate ? "Real estate excluded" : "Real estate included"}; ${assumptions.wealthGrowthRate === 0 ? "wealth held at the snapshot" : `${assumptions.wealthGrowthRate > 0 ? "+" : ""}${(assumptions.wealthGrowthRate * 100).toFixed(1)}% a year to valuation`}`;
    case "timing":
      return `${(assumptions.discountRate * 100).toFixed(1)}% real discount; ${(assumptions.inflationRate * 100).toFixed(1)}% inflation; ${assumptions.wealthTaxPaymentMode === WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS ? "five installments" : "lump sum in 2027"}`;
    default:
      return "";
  }
}

function BaseNotes({ notes, peopleInBase, includeNonCitizens, nonCitizenCount, nonCitizenWealthB }) {
  const lines = [];

  if (notes.assumedResidencyCount > 0) {
    lines.push(
      `${notes.assumedResidencyCount} people (${formatBillions(notes.assumedResidencyWealthB)}) are on Forbes' California list now and were not on its January 1, 2026 list. They are assumed to have been California residents on January 1.`
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

  if (includeNonCitizens && notes.assumedResidencyNonCitizenCount > 0) {
    lines.push(
      `The January 1 list is rebuilt from US-citizen Forbes profiles, so the ${notes.assumedResidencyNonCitizenCount} non-US citizens Forbes now places in California (${formatBillions(notes.assumedResidencyNonCitizenWealthB)}) enter only through the current list, with their January 1 residency assumed. Galle, Gamage, Saez and Shanske add the same group.`
    );
  } else if (!includeNonCitizens && nonCitizenCount > 0) {
    lines.push(
      `${nonCitizenCount} non-US citizens Forbes places in California (${formatBillions(nonCitizenWealthB)}) are out of the base under the legal assumptions; their income tax stays in the cohort.`
    );
  }

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
  const [step, setStep] = useState("compare");
  const [focusOnArrival, setFocusOnArrival] = useState(false);
  const [scenarioBase, setScenarioBase] = useState("baseline");
  const [copyStatus, setCopyStatus] = useState("idle");
  const [loadedSnapshot, dispatchSnapshot] = useReducer(snapshotReducer, {
    date: LIVE_DATE,
    requestedDate: LIVE_DATE,
    rows: liveData,
    valuations: rosterValuations.sourceDate === LIVE_DATE ? rosterValuations : null,
    status: "ready",
    errorDate: null,
  });
  const loadedDate = loadedSnapshot.date;
  const loadingDate = params.snapshotDate !== loadedDate &&
    loadedSnapshot.errorDate !== params.snapshotDate ? params.snapshotDate : null;
  const loadFailure = loadedSnapshot.errorDate;

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const parsed = normalizeParams(parseScenarioParams(searchParams, DEFAULT_PARAMS));
    // A link may name a date inside the index range that has no file.
    parsed.snapshotDate = resolveSnapshotDate(parsed.snapshotDate);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from the URL after mount; window is unavailable during render
    setParams(parsed);
    setHasSyncedUrlState(true);
    // A link that carries assumptions opens where assumptions change.
    const linked = assumptionsOf(parsed);
    if (matchingSetKey(linked) !== "baseline") {
      setScenarioBase(closestSet(linked, ASSUMPTION_SETS));
      setStep("build");
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
    dispatchSnapshot({ type: "start", date });
    if (BUNDLED_SNAPSHOTS[date]) {
      dispatchSnapshot({ type: "success", snapshot: {
        date, rows: BUNDLED_SNAPSHOTS[date],
        valuations: date === LIVE_DATE && rosterValuations.sourceDate === date ? rosterValuations : null,
      } });
      return;
    }
    const controller = new AbortController();
    const loadJson = (path) => fetch(`${BASE_PATH}/${path}`, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw Object.assign(new Error(`${path}: HTTP ${response.status}`), { status: response.status });
      return response.json();
    });
    loadSnapshot({ date, loadJson })
      .then((snapshot) => {
        if (!controller.signal.aborted) dispatchSnapshot({ type: "success", snapshot });
      })
      .catch(() => {
        if (!controller.signal.aborted) dispatchSnapshot({ type: "failure", date });
      });
    return () => controller.abort();
  }, [params.snapshotDate]);

  useEffect(() => {
    if (copyStatus === "idle") {
      return;
    }

    const timeout = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const snapshotRows = useMemo(
    () => selectSnapshotRows({ ...loadedSnapshot, residencyRows: residencyRosterData, metadata: billionaireMetadata }),
    [loadedSnapshot]
  );
  const sourceDate = useMemo(
    () => snapshotSourceDate(loadedDate),
    [loadedDate]
  );
  const score = useMemo(
    () => (assumptions) =>
      scoreScenario({ params: assumptions, rows: snapshotRows, incomeTaxLookup, sourceDate }),
    [snapshotRows, sourceDate]
  );
  const assumptions = useMemo(() => assumptionsOf(params), [params]);
  const current = useMemo(() => score(assumptions), [score, assumptions]);
  // The bridge, the grids and the allocation table are the expensive parts;
  // they follow the sliders one render behind so the number and the slider
  // never wait for them.
  const deferredAssumptions = useDeferredValue(assumptions);
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
  const activeSet = matchingSetKey(assumptions);
  // A jump to a named set lands at once, so the chart never pairs the new
  // origin with the old assumptions. Only the sliders wait.
  const yourAssumptions = activeSet ? ASSUMPTION_SETS[activeSet] : deferredAssumptions;
  const endpointAssumptions = (key) =>
    key === "your" ? yourAssumptions : ASSUMPTION_SETS[key];
  const hasEdits = activeSet !== scenarioBase;
  // "Your scenario" joins step one's menus once it exists and leaves with its
  // edits, so the comparison falls back to a published set.
  const compareEndpoint = (key, other) =>
    key === "your" && !hasEdits ? (other === "berkeley" ? "hoover" : "berkeley") : key;
  const compareFrom = compareEndpoint(bridgeFrom, bridgeTo);
  const compareTo = compareEndpoint(bridgeTo, bridgeFrom);
  // Step one compares whichever two the menus name; step two measures the
  // sliders against the set they started from.
  const building = step === "build";
  const bridgeStart = building ? scenarioBase : compareFrom;
  const bridgeEnd = building ? "your" : compareTo;
  const scenarioInBridge = bridgeStart === "your" || bridgeEnd === "your";
  const bridgeEndLabel = BRIDGE_ENDPOINTS[building && activeSet ? activeSet : bridgeEnd];
  const bridge = useMemo(
    () =>
      scenarioBridge({
        start: endpointAssumptions(bridgeStart),
        end: endpointAssumptions(bridgeEnd),
        score,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bridgeStart, bridgeEnd, scenarioInBridge ? yourAssumptions : null, score]
  );
  // What each bar compares: its assumption at the two ends of the bridge.
  const stepDetails = useMemo(() => {
    const endpoints = [bridgeStart, bridgeEnd].map((key) => {
      const set = endpointAssumptions(key);

      return {
        key,
        set,
        context: { remainingResidentWealthB: residentWealthB(score(set)) },
      };
    });

    return Object.fromEntries(
      ASSUMPTION_GROUPS.map((group) => [
        group.id,
        {
          title: group.label,
          endpoints: endpoints.map(({ key, set, context }) => ({
            label: key === "your" && building ? bridgeEndLabel : BRIDGE_ENDPOINTS[key],
            setting: summarizeGroup(group, set, context),
            matches:
              key === "your"
                ? Object.keys(ASSUMPTION_SETS)
                    .filter((setKey) => groupMatchesSet(group, set, ASSUMPTION_SETS[setKey]))
                    .map((setKey) => SET_LABELS[setKey])
                : [],
          })),
        },
      ])
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeStart, bridgeEnd, bridgeEndLabel, scenarioInBridge ? yourAssumptions : null, score]);
  const remainingResidentWealthB = residentWealthB(current);
  const summaryContext = { remainingResidentWealthB };
  const groupMatches = Object.fromEntries(
    ASSUMPTION_GROUPS.map((group) => [
      group.id,
      Object.keys(ASSUMPTION_SETS).filter((key) =>
        groupMatchesSet(group, assumptions, ASSUMPTION_SETS[key])
      ),
    ])
  );
  const referenceLines = [];
  if (bridgeStart !== "baseline" && bridgeEnd !== "baseline") {
    referenceLines.push({
      label: "Statutory score, no behavior",
      value: campValues.baseline,
      stroke: "var(--gray-400)",
    });
  }
  const allocationComparison = useMemo(() => {
    const byMethod = (method) =>
      score({ ...deferredAssumptions, incomeTaxMethod: method }).micro.rows;
    const byWealth = byMethod(INCOME_TAX_METHODS.WEALTH);
    const filings = byMethod(INCOME_TAX_METHODS.FILINGS);
    // The rows the allocation divides the total across, so share × total
    // equals the by-wealth dollars.
    const cohortWealthB = byWealth
      .filter((row) => row.inIncomeTaxCohort)
      .reduce((sum, row) => sum + row.netWorthB, 0);

    return FOUR_LARGEST.flatMap((name) => {
      const wealthRow = byWealth.find((row) => row.name === name);
      const filingsRow = filings.find((row) => row.name === name);

      return wealthRow && filingsRow
        ? [
            {
              name,
              wealthShare: cohortWealthB > 0 ? wealthRow.netWorthB / cohortWealthB : 0,
              byWealthB: wealthRow.annualIncomeTaxB,
              filingsB: filingsRow.annualIncomeTaxB,
            },
          ]
        : [];
    });
  }, [score, deferredAssumptions]);

  const loadedSnapshotLabel = loadedDate === LIVE_DATE
    ? LIVE_SNAPSHOT_TIMESTAMP_LABEL ? `Forbes as of ${LIVE_SNAPSHOT_TIMESTAMP_LABEL}` : `Forbes as of ${LIVE_DATE}`
    : loadedDate === PAPER_DATE ? "Forbes snapshot of October 17, 2025, with Rauh et al.'s asset data" : `Forbes snapshot of ${loadedDate}`;
  const snapshotLabel = loadingDate
    ? `${loadedSnapshotLabel}; loading ${loadingDate}` : loadedSnapshotLabel;
  const loadFailureNote = loadFailure
    ? ` The stored snapshot of ${loadFailure} could not be loaded; figures still use ${loadedDate}.`
    : "";
  const pitEffectsEnabled = params.includeIncomeTaxEffects;
  const embedBasePath =
    typeof window === "undefined"
      ? "/us/california-wealth-tax"
      : window.location.pathname.replace(/\/$/, "");
  const paperWebHref = `${embedBasePath}/papers/web/index.html`;
  const paperPdfHref = `${embedBasePath}/papers/california-wealth-tax-ssrn-draft.pdf`;

  function update(key, value) {
    setParams((prev) => normalizeParams({ ...prev, [key]: value }));
  }

  function updateParams(updater) {
    setParams((prev) => normalizeParams(updater(prev)));
  }

  function startFrom(key) {
    setParams((prev) => normalizeParams({ ...prev, ...ASSUMPTION_SETS[key] }));
    setScenarioBase(key);
  }

  function showStep(next) {
    setFocusOnArrival(false);
    setStep(next);
  }

  function enterBuild() {
    setFocusOnArrival(true);
    setStep("build");
  }

  function buildFrom(key) {
    startFrom(key);
    setActiveGroup(null);
    enterBuild();
  }

  // A bar opens at the comparison's destination, so the first change moves one
  // bar. Changes already under way stay.
  function openFromComparison(groupId) {
    if (!hasEdits) {
      startFrom(compareTo);
    }
    setActiveGroup(groupId);
    enterBuild();
  }

  function applyGroupFrom(groupId, setKey) {
    const group = ASSUMPTION_GROUP_BY_ID.get(groupId);

    setParams((prev) =>
      normalizeParams({
        ...prev,
        ...Object.fromEntries(group.keys.map((key) => [key, ASSUMPTION_SETS[setKey][key]])),
      })
    );
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
    <label className="inline-flex max-w-full flex-wrap items-center gap-2 text-sm text-[var(--gray-600)]">
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
        className="min-w-0 max-w-full rounded-full border border-[var(--gray-300)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--gray-700)]"
      >
        <option value="live">Latest Forbes data ({longDate(LIVE_DATE)})</option>
        <option value="paper">October 17, 2025 (Rauh asset data)</option>
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
          className="min-w-0 max-w-full rounded-full border border-[var(--gray-300)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--gray-700)]"
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
                <div className="flex flex-wrap gap-2">
                  <a
                    href={paperPdfHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gray-300)] bg-white px-4 py-2 text-sm font-medium text-[var(--gray-700)] transition-colors hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                  >
                    Open PDF
                  </a>
                  <a
                    href="https://github.com/PolicyEngine/california-wealth-tax"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gray-300)] bg-white px-4 py-2 text-sm font-medium text-[var(--gray-700)] transition-colors hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                  >
                    Code (MIT)
                  </a>
                </div>
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
              <section className="space-y-5 rounded-[30px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
                <StepTabs step={step} onChange={showStep} />
                {building ? (
                  <BuildStep
                    bridge={bridge}
                    from={scenarioBase}
                    endLabel={bridgeEndLabel}
                    hasEdits={hasEdits}
                    focusOnArrival={focusOnArrival}
                    campValues={campValues}
                    onStartFrom={startFrom}
                    groups={ASSUMPTION_GROUPS}
                    activeGroup={activeGroup}
                    onSelectGroup={setActiveGroup}
                    stepDetails={stepDetails}
                    referenceLines={referenceLines}
                    readout={
                      <ResultStrip
                        headlineValue={current.result.headlineValue}
                        headlineLabel={
                          pitEffectsEnabled
                            ? "Net fiscal impact, present value as of 2026"
                            : "One-time wealth-tax revenue"
                        }
                        presentValue={current.result.netFiscalImpact}
                        activeSet={activeSet}
                      />
                    }
                    panel={
                      activeGroupConfig && (
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
                              snapshotDate: loadedDate,
                              allocationComparison,
                              incomeTaxDepartureFloorShare:
                                current.micro.cohortIncomeTaxTotalB > 0
                                  ? (current.micro.knownDepartureIncomeTaxB + current.micro.unannouncedIncomeTaxB) /
                                    current.micro.cohortIncomeTaxTotalB
                                  : 0,
                              modeledLaterDepartureShare: current.modeledLaterDepartureShare,
                              nonCitizenCount: current.micro.nonCitizenCount,
                              nonCitizenWealthB: current.micro.nonCitizenWealthB,
                            }}
                        />
                      )
                    }
                    footer={
                      <ScenarioActions
                        dataControl={dataControl}
                        copyStatus={copyStatus}
                        onCopyLink={copyScenarioLink}
                      />
                    }
                  />
                ) : (
                  <CompareStep
                    bridge={bridge}
                    from={compareFrom}
                    to={compareTo}
                    onChangeFrom={setBridgeFrom}
                    onChangeTo={setBridgeTo}
                    hasEdits={hasEdits}
                    campValues={campValues}
                    onStartFrom={buildFrom}
                    onOpenAssumption={openFromComparison}
                    onResumeScenario={enterBuild}
                    stepDetails={stepDetails}
                    referenceLines={referenceLines}
                    snapshotDate={loadedDate}
                    dataControl={dataControl}
                  />
                )}
              </section>

              <ResultNotes
                headlineNote={
                  building
                    ? pitEffectsEnabled
                        ? `Wealth-tax receipts less attributed future California income-tax losses, in 2026 dollars; ${(params.inflationRate * 100).toFixed(1)}% annual inflation assumed. Receipts go to a reserve fund that is legally separate from the General Fund, where income tax is collected. ${snapshotLabel}.${loadFailureNote}`
                        : `Nominal receipts, first due with 2026 returns in 2027. Excludes future California income-tax losses. ${snapshotLabel}.${loadFailureNote}`
                    : loadFailureNote.trim()
                }
              />


              {building && (
                <section className="space-y-5 rounded-[30px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                      <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
                        Who pays
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
                        {loadedDate === PAPER_DATE
                          ? "Everyone in the October 17, 2025 California Forbes snapshot, valued that day, with Rauh et al.'s real-estate data and the stated exclusions."
                          : loadedDate > RESIDENCY_ROSTER_DATE
                            ? `Everyone Forbes listed in California on January 1, 2026, valued at their Forbes worth on ${loadedDate} wherever Forbes lists them, plus everyone Forbes has added to its California list since.`
                            : `Everyone Forbes listed in California on ${loadedDate}, valued that day.`}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
                        Known separately listed spouses (Jay-Z and Beyoncé; Lynda and Stewart Resnick)
                        share one wealth-tax threshold and rate, including both spouses&apos; observed
                        assets if either remains a resident. The table allocates joint liability to
                        their asset shares; income tax stays person-based. Other unobserved spouse
                        and minor-child assets are not available in Forbes data.
                      </p>
                    </div>
                    <details className="w-full max-w-md text-sm text-[var(--gray-600)] lg:w-auto">
                      <summary className="cursor-pointer text-xs font-semibold text-[var(--gray-500)] hover:text-[var(--teal-700)]">
                        Derivation
                      </summary>
                      <div className="mt-2 divide-y divide-[var(--gray-100)]">
                        <DerivationRow label="Statutory wealth tax, everyone in the base" value={formatBillions(current.micro.grossWealthTaxBeforeAdditionalDeparturesB + current.micro.legallyExcludedGrossWealthTaxB)} />
                        {current.micro.legallyExcludedGrossWealthTaxB > 0 && (
                          <DerivationRow label="Less people left out on legal assumptions" value={`−${formatBillions(current.micro.legallyExcludedGrossWealthTaxB)}`} />
                        )}
                        {current.micro.unannouncedWealthTaxLossB > 0 && (
                          <DerivationRow label="Less modeled further departures" value={`−${formatBillions(current.micro.unannouncedWealthTaxLossB)}`} />
                        )}
                        <DerivationRow label="After haircut" value={formatBillions(current.result.wealthTaxAfterHaircutB)} />
                        {current.result.litigationSurvivalRate < 1 && (
                          <DerivationRow
                            label={`Expected, at a ${(current.result.litigationSurvivalRate * 100).toFixed(0)}% chance it survives challenge`}
                            value={formatBillions(current.result.wealthTaxCollected)}
                          />
                        )}
                        {current.result.wealthTaxDeferralChargeB > 0 && (
                          <DerivationRow label="Installment deferral charges" value={formatBillions(current.result.wealthTaxDeferralChargeB)} />
                        )}
                        <DerivationRow label="Nominal receipts" value={formatBillions(current.result.wealthTaxNominalReceiptsB)} />
                        <DerivationRow label="Present value of receipts (2026)" value={formatBillions(current.result.pvWealthTaxReceipts)} />
                        {pitEffectsEnabled && (
                          <>
                            <DerivationRow label="Movers' income tax lost, attributed" value={`$${current.result.annualIncomeTaxLost.toFixed(2)}B a year`} />
                            {current.micro.laterDepartureIncomeTaxB > 0 && (
                              <DerivationRow
                                label="of which people leaving after January 1 (income tax only)"
                                value={`$${(current.micro.laterDepartureIncomeTaxB * current.result.incomeTaxAttributionRate).toFixed(2)}B a year`}
                              />
                            )}
                            <DerivationRow label="Present value of lost income tax" value={formatBillions(current.result.pvLostIncomeTax)} />
                          </>
                        )}
                        <DerivationRow label="Net present value" value={formatBillions(current.result.netFiscalImpact, { showPlus: true })} />
                      </div>
                    </details>
                  </div>
                  <BaseNotes
                    notes={current.micro.baseNotes}
                    peopleInBase={current.micro.wealthTaxBaseRows.length}
                    includeNonCitizens={params.includeNonCitizens}
                    nonCitizenCount={current.micro.excludedNonCitizenCount}
                    nonCitizenWealthB={current.micro.excludedNonCitizenWealthB}
                  />
                  <p className="text-xs leading-5 text-[var(--gray-500)]">
                    The income-tax column is what each person pays a year. The
                    derivation&apos;s lost income tax is the rows of people
                    removed or marked as leaving, plus the modeled share of
                    everyone else&apos;s, times the attribution rate.
                  </p>
                  <BillionaireTable
                    rows={current.micro.rows}
                    avoidanceRate={params.avoidanceRate}
                    excludeRealEstate={params.excludeRealEstate}
                    modeledDepartures={{
                      share: current.modeledAdditionalDepartureShare,
                      wealthTaxB: current.micro.unannouncedWealthTaxLossB,
                      incomeTaxB: current.micro.unannouncedIncomeTaxB,
                    }}
                  />
                </section>
              )}
            </>
          )}

          <RelatedWork />
        </div>
      </main>
    </div>
  );
}
