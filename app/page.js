"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import AssumptionPanel from "@/app/components/AssumptionPanels";
import BillionaireTable from "@/app/components/BillionaireTable";
import Heatmap from "@/app/components/Heatmap";
import LiveBridge from "@/app/components/LiveBridge";
import ResultStrip from "@/app/components/ResultStrip";
import { ASSUMPTION_GROUPS, ASSUMPTION_GROUP_BY_ID, scenarioBridge } from "@/lib/bridge";
import { WEALTH_TAX_PAYMENT_MODES } from "@/lib/calculator";
import { DEPARTURE_RESPONSE_MODES } from "@/lib/departureResponse";
import { INCOME_TAX_METHODS } from "@/lib/microModel";
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
  baseline: "Statutory",
  berkeley: "Berkeley",
  hoover: "Hoover",
};
// Settings the two heatmaps override, so a change to them alone must not
// recompute the grids.
const HEATMAP_OVERRIDDEN_KEYS = new Set([
  "includeIncomeTaxEffects",
  "departureResponseMode",
  "unannouncedDepartureShare",
  "migrationSemiElasticity",
  "incomeTaxMethod",
  "cohortIncomeTaxB",
  "incomeYieldRate",
]);

// Net present value is exactly bilinear in the unannounced share and the
// cohort total (the wealth-tax loss is linear in the share; the income-tax
// loss is a share-dependent slice of a total that is linear in the cohort
// figure), so four corner scorings give every cell. lib/scenario.test.js
// checks this against direct scoring.
function bilinearGrid(evaluate, xs, ys) {
  const [x0, x1] = [xs[0], xs.at(-1)];
  const [y0, y1] = [ys[0], ys.at(-1)];
  const f00 = evaluate(x0, y0);
  const f10 = evaluate(x1, y0);
  const f01 = evaluate(x0, y1);
  const f11 = evaluate(x1, y1);

  return (x, y) => {
    const u = (x - x0) / (x1 - x0);
    const v = (y - y0) / (y1 - y0);
    return f00 * (1 - u) * (1 - v) + f10 * u * (1 - v) + f01 * (1 - u) * v + f11 * u * v;
  };
}
const DEFAULT_PARAMS = { snapshotDate: LIVE_DATE, ...BASELINE_ASSUMPTIONS };
// The grids cover every value the sliders and links allow, so the user's
// scenario always has a cell.
const HEATMAP_SHARES = Array.from({ length: 21 }, (_, i) => i * 0.05);
const HEATMAP_COHORT_TAX_B = Array.from({ length: 15 }, (_, i) => 1 + i * 0.5);
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

function getSnapshotRows(snapshotDate, data) {
  return annotateBillionaires({
    // `null` means the snapshot for this date could not be loaded.
    billionaires: data ?? [],
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

// When `key` becomes the bridge's destination, the origin moves if it would
// otherwise carry the same assumptions: the set itself, or "your scenario",
// which equals the set once it is applied.
function bridgeOriginFor(key, from) {
  return from === key || from === "your"
    ? key === "berkeley"
      ? "baseline"
      : "berkeley"
    : from;
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
        ? `Counted: ${(assumptions.incomeTaxAttributionRate * 100).toFixed(0)}% attributed, ${assumptions.horizonYears === Infinity ? "in perpetuity" : `${assumptions.horizonYears} years`}${assumptions.incomeGrowthRate !== 0 ? `, ${assumptions.incomeGrowthRate > 0 ? "+" : ""}${(assumptions.incomeGrowthRate * 100).toFixed(1)}% real growth` : ""}${assumptions.annualReturnRate > 0 ? `, ${(assumptions.annualReturnRate * 100).toFixed(0)}% return a year` : ""}`
        : "Wealth tax only";
    case "incomeAllocation":
      return assumptions.incomeTaxMethod === INCOME_TAX_METHODS.YIELD
        ? `Uniform yield: income ${(assumptions.incomeYieldRate * 100).toFixed(1)}% of wealth`
        : `$${assumptions.cohortIncomeTaxB.toFixed(2)}B a year, ${assumptions.incomeTaxMethod === INCOME_TAX_METHODS.WEALTH ? "divided by wealth" : "filings for the four largest, the rest by wealth"}`;
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

  lines.push(
    `The January 1 list is rebuilt from US-citizen Forbes profiles, so the ${notes.assumedResidencyNonCitizenCount} non-US citizens Forbes now places in California (${formatBillions(notes.assumedResidencyNonCitizenWealthB)}) enter only through the current list, with their January 1 residency assumed. Galle, Gamage, Saez and Shanske add the same group.`
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
  // All-states valuations for a stored date, when the daily job wrote them.
  const [fetchedRosterValuations, setFetchedRosterValuations] = useState(null);
  // A stored date whose files could not be loaded; the page shows the live
  // date instead and says so.
  const [loadFailure, setLoadFailure] = useState(null);
  // The stored date whose files are still arriving; results are stale until then.
  const loadingDate =
    snapshotData !== null &&
    !BUNDLED_SNAPSHOTS[params.snapshotDate] &&
    snapshotData !== BUNDLED_SNAPSHOTS[LIVE_DATE] &&
    fetchedRosterValuations?.sourceDate !== params.snapshotDate
      ? params.snapshotDate
      : null;

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const parsed = normalizeParams(parseScenarioParams(searchParams, DEFAULT_PARAMS));
    // A link may name a date inside the index range that has no file.
    parsed.snapshotDate = resolveSnapshotDate(parsed.snapshotDate);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from the URL after mount; window is unavailable during render
    setParams(parsed);
    setHasSyncedUrlState(true);
    if (searchParams.toString().length > 0) {
      // A link that equals a set bridges to that set, never to itself.
      const linkedSet = matchingSetKey(assumptionsOf(parsed));
      if (linkedSet && linkedSet !== "baseline") {
        setBridgeFrom((from) => bridgeOriginFor(linkedSet, from));
        setBridgeTo(linkedSet);
      } else if (!linkedSet) {
        setBridgeTo("your");
      }
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
    const load = (path) =>
      fetch(`${BASE_PATH}/${path}`).then((r) => {
        if (!r.ok) {
          throw new Error(`${path}: HTTP ${r.status}`);
        }
        return r.json();
      });
    Promise.all([
      load(`snapshots/${date}.json`),
      // Dated roster valuations exist from September 18, 2026; before that
      // the roster falls back to its January 1 values, which the notes say.
      load(`roster_valuations/${date}.json`).catch(() => null),
    ])
      .then(([rows, valuations]) => {
        if (!stale) {
          setSnapshotData(rows);
          setFetchedRosterValuations(valuations);
        }
      })
      .catch(() => {
        // Never show another date's rows under this date's label: go back to
        // the live date and say why.
        if (!stale) {
          setLoadFailure(date);
          setFetchedRosterValuations(null);
          setParams((prev) => normalizeParams({ ...prev, snapshotDate: LIVE_DATE }));
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
        // All-states valuations describe one date: the bundled file for the
        // live date, the dated file for a stored one.
        rosterValuations:
          params.snapshotDate === LIVE_DATE && rosterValuations.sourceDate === LIVE_DATE
            ? rosterValuations
            : fetchedRosterValuations?.sourceDate === params.snapshotDate
              ? fetchedRosterValuations
              : null,
        // People on the California list now but not on the January 1 list owe the tax if
        // they were residents that day; before the roster date the concept
        // does not apply.
        includeNewEntrants: params.snapshotDate > RESIDENCY_ROSTER_DATE,
      }),
    [residencySnapshotRows, params.snapshotDate, snapshotData, fetchedRosterValuations]
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
  const endpointAssumptions = (key) =>
    key === "your" ? deferredAssumptions : ASSUMPTION_SETS[key];
  const bridgeUsesYourScenario = bridgeFrom === "your" || bridgeTo === "your";
  const bridge = useMemo(
    () =>
      scenarioBridge({
        start: endpointAssumptions(bridgeFrom),
        end: endpointAssumptions(bridgeTo),
        score,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bridgeFrom, bridgeTo, bridgeUsesYourScenario ? deferredAssumptions : null, score]
  );
  const activeSet = matchingSetKey(assumptions);
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
  if (bridgeFrom !== "baseline" && bridgeTo !== "baseline") {
    referenceLines.push({
      label: "Statutory, no behavior",
      value: campValues.baseline,
      stroke: "var(--gray-400)",
    });
  }
  // The user's line appears only where it says something the chart does not:
  // a finite value that is not already an endpoint or the statutory line.
  const yourValue = current.result.netFiscalImpact;
  const alreadyShown = [
    bridge.startValue,
    bridge.endValue,
    ...referenceLines.map((line) => line.value),
  ];
  if (
    !bridgeUsesYourScenario &&
    Number.isFinite(yourValue) &&
    alreadyShown.every((value) => Math.abs(value - yourValue) >= 0.05)
  ) {
    referenceLines.push({ label: "Yours", value: yourValue, stroke: "var(--gray-700)" });
  }
  const heatmapBaseKey = JSON.stringify(
    Object.fromEntries(
      Object.entries(deferredAssumptions).filter(([key]) => !HEATMAP_OVERRIDDEN_KEYS.has(key))
    )
  );
  const heatmapEvaluators = useMemo(
    () =>
      Object.fromEntries(
        [INCOME_TAX_METHODS.WEALTH, INCOME_TAX_METHODS.FILINGS].map((method) => [
          method,
          bilinearGrid(
            (share, cohortIncomeTaxB) =>
              score({
                ...deferredAssumptions,
                includeIncomeTaxEffects: true,
                departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
                unannouncedDepartureShare: share,
                incomeTaxMethod: method,
                cohortIncomeTaxB,
              }).result.netFiscalImpact,
            HEATMAP_SHARES,
            HEATMAP_COHORT_TAX_B
          ),
        ])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [score, heatmapBaseKey]
  );
  // With no documented departure applied, the modeled response takes the same
  // proportional slice of everyone's income tax under either division, so the
  // two grids coincide to display precision (they differ by a few million
  // through cohort members outside the reachable base); the division only
  // changes what leaves with named movers.
  const heatmapsCoincide = useMemo(
    () =>
      HEATMAP_SHARES.every((share) =>
        HEATMAP_COHORT_TAX_B.every(
          (tax) =>
            Math.abs(
              heatmapEvaluators[INCOME_TAX_METHODS.WEALTH](share, tax) -
                heatmapEvaluators[INCOME_TAX_METHODS.FILINGS](share, tax)
            ) < 0.05
        )
      ),
    [heatmapEvaluators]
  );
  const heatmapExtent = useMemo(
    () =>
      Math.max(
        1,
        ...[INCOME_TAX_METHODS.WEALTH, INCOME_TAX_METHODS.FILINGS].flatMap((method) =>
          [HEATMAP_SHARES[0], HEATMAP_SHARES.at(-1)].flatMap((share) =>
            [HEATMAP_COHORT_TAX_B[0], HEATMAP_COHORT_TAX_B.at(-1)]
              .map((tax) => Math.abs(heatmapEvaluators[method](share, tax)))
              // A divergent present value is painted neutral, not scaled to.
              .filter((value) => Number.isFinite(value))
          )
        )
      ),
    [heatmapEvaluators]
  );
  // The mark is drawn only where the scenario lies on the grid; the grids
  // cover the sliders' and links' ranges, so it is off only for a hand-edited
  // link.
  const heatmapMarksFor = (method) => {
    const x = current.modeledAdditionalDepartureShare;
    const y = assumptions.cohortIncomeTaxB;
    const onGrid =
      x >= HEATMAP_SHARES[0] &&
      x <= HEATMAP_SHARES.at(-1) &&
      y >= HEATMAP_COHORT_TAX_B[0] &&
      y <= HEATMAP_COHORT_TAX_B.at(-1);

    return assumptions.includeIncomeTaxEffects &&
      assumptions.incomeTaxMethod === method &&
      onGrid
      ? [{ label: "Your scenario", x, y }]
      : [];
  };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score, heatmapBaseKey, deferredAssumptions.cohortIncomeTaxB]);

  const snapshotLabel =
    params.snapshotDate === LIVE_DATE
      ? LIVE_SNAPSHOT_TIMESTAMP_LABEL
        ? `Forbes as of ${LIVE_SNAPSHOT_TIMESTAMP_LABEL}`
        : `Forbes as of ${LIVE_DATE}`
      : params.snapshotDate === PAPER_DATE
        ? "Forbes list of October 17, 2025, Rauh et al.'s roster"
        : loadingDate
          ? `Loading the Forbes snapshot of ${loadingDate}; figures show the previous data until it arrives`
          : `Forbes snapshot of ${params.snapshotDate}`;
  const loadFailureNote = loadFailure
    ? ` The stored snapshot of ${loadFailure} could not be loaded, so the latest data is shown instead.`
    : "";
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
    setBridgeFrom((from) => bridgeOriginFor(key, from));
    setBridgeTo(key);
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
        <option value="live">Latest Forbes data ({LIVE_DATE})</option>
        <option value="paper">October 17, 2025 list (Rauh et al.&apos;s roster)</option>
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

              <ResultStrip
                headlineValue={current.result.headlineValue}
                headlineLabel={
                  pitEffectsEnabled
                    ? "Net fiscal impact, present value as of 2026"
                    : "One-time wealth-tax revenue"
                }
                headlineNote={
                  pitEffectsEnabled
                    ? `Wealth-tax receipts less attributed future California income-tax losses. Receipts go to a reserve fund that is legally separate from the General Fund, where income tax is collected. ${snapshotLabel}.${loadFailureNote}`
                    : `Nominal receipts, first due with 2026 returns in 2027. Excludes future California income-tax losses. ${snapshotLabel}.${loadFailureNote}`
                }
                presentValue={current.result.netFiscalImpact}
                campValues={campValues}
                activeSet={activeSet}
                onApplySet={applySet}
                copyStatus={copyStatus}
                onCopyLink={copyScenarioLink}
                dataControl={dataControl}
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
                    allocationComparison,
                  }}
                  onClose={() => setActiveGroup(null)}
                />
              )}

              <section className="space-y-5 rounded-[30px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
                <div className="max-w-3xl">
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
                    Who pays the income tax matters when the largest fortunes are the movers
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
                    Net present value as of 2026 with income-tax effects
                    counted, across how much of the reachable base left before
                    January 1 without public notice and how much California
                    income tax the cohort pays in total. Same axes, same colors,
                    two ways of dividing that total among people. Other
                    assumptions as in your scenario.
                    {heatmapsCoincide
                      ? " The two grids coincide right now: with no documented departure applied, the unannounced share takes the same slice of everyone's income tax under either division. Apply a departure claim in the residency panel and the grids separate."
                      : " The grids differ because the departure claims applied in the residency panel name specific people, and the two divisions assign them different amounts."}
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  {[
                    {
                      method: INCOME_TAX_METHODS.WEALTH,
                      title: "Divided by wealth (Rauh et al.)",
                    },
                    {
                      method: INCOME_TAX_METHODS.FILINGS,
                      title: "Filings for the four largest fortunes, the rest by wealth",
                    },
                  ].map((panel) => (
                    <div key={panel.method} className="space-y-2">
                      <p className="text-sm font-semibold text-[var(--gray-700)]">{panel.title}</p>
                      <Heatmap
                        evaluate={heatmapEvaluators[panel.method]}
                        xs={HEATMAP_SHARES}
                        ys={HEATMAP_COHORT_TAX_B}
                        marks={heatmapMarksFor(panel.method)}
                        extent={heatmapExtent}
                        cellW={26}
                        cellH={20}
                        xLabel="Unannounced departures before January 1 (share of the reachable base)"
                        yLabel="Cohort income tax, $B a year"
                        formatX={(value) => `${(value * 100).toFixed(0)}%`}
                        formatY={(value) => `$${value.toFixed(1)}B`}
                        ariaLabel={`Net present value by unannounced-departure share and cohort income tax: ${panel.title}`}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-5 rounded-[30px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
                      Who pays
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
                      {params.snapshotDate === PAPER_DATE
                        ? "Everyone Forbes listed in California on October 17, 2025, Rauh et al.'s roster, valued that day."
                        : params.snapshotDate > RESIDENCY_ROSTER_DATE
                          ? `Everyone Forbes listed in California on January 1, 2026, valued at their Forbes worth on ${params.snapshotDate} wherever Forbes lists them, plus everyone Forbes has added to its California list since.`
                          : `Everyone Forbes listed in California on ${params.snapshotDate}, valued that day.`}
                    </p>
                  </div>
                  <details className="w-full max-w-md text-sm text-[var(--gray-600)] lg:w-auto">
                    <summary className="cursor-pointer text-xs font-semibold text-[var(--gray-500)] hover:text-[var(--teal-700)]">
                      Derivation
                    </summary>
                    <div className="mt-2 divide-y divide-[var(--gray-100)]">
                      <DerivationRow label="Statutory wealth tax, everyone in the base" value={formatBillions(current.micro.grossWealthTaxBeforeAdditionalDeparturesB)} />
                      {current.micro.unannouncedWealthTaxLossB > 0 && (
                        <DerivationRow label="Less modeled further departures" value={`−${formatBillions(current.micro.unannouncedWealthTaxLossB)}`} />
                      )}
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
            </>
          )}
        </div>
      </main>
    </div>
  );
}
