"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  calculateFiscalImpact,
  WEALTH_TAX_PAYMENT_MODES,
} from "@/lib/calculator";
import { formatBillions } from "@/lib/format";
import {
  annotateBillionaires,
  buildResidencyRosterValuationRows,
  computeMicroResults,
} from "@/lib/microModel";
import Wizard from "@/app/components/Wizard";
import BillionaireTable from "@/app/components/BillionaireTable";
import {
  buildScenarioHref,
  parseScenarioParams,
} from "@/lib/scenarioUrl";
import {
  DEPARTURE_RESPONSE_MODES,
  effectiveAdditionalDepartureShare,
} from "@/lib/departureResponse";
import {
  DEFAULT_INCOME_TAX_MOVER_IDS,
  INCOME_TAX_MOVER_ADJUSTMENTS,
  PRE_SNAPSHOT_EXCLUSION_IDS,
  RESIDENCY_ADJUSTMENTS,
  RESIDENCY_ONLY_EXCLUSION_IDS,
  RESIDENCY_ROSTER_DATE,
  incomeTaxMoverNamesFromIds,
  normalizeIncomeTaxMoverIds,
  normalizeResidencyExclusionIds,
  residencyExcludedNamesFromIds,
} from "@/lib/residencyAdjustments";
import billionaireMetadata from "@/data/billionaire_metadata.json";
import incomeTaxLookup from "@/data/income_tax_lookup.json";
import rauhData from "@/data/billionaires_rauh.json";
import liveData from "@/data/billionaires_live.json";
import liveMetadata from "@/data/billionaires_live_meta.json";
import snapshotIndex from "@/public/snapshots/index.json";
import residencyRosterData from "@/public/snapshots/2026-01-01.json";

const BALLOT_MEASURE_URL =
  "https://oag.ca.gov/system/files/initiatives/pdfs/25-0024A1%20%28Billionaire%20Tax%20%29.pdf";

// CBO CPI-U forecast via PolicyEngine: ~2.45% annualized 2026–2030.
// Used to convert nominal wealth growth to real for PV discounting.
const INFLATION_RATE = 0.025;

// Bundled snapshots (always available without fetch)
const BUNDLED_SNAPSHOTS = {
  "2025-10-17": rauhData,
  [RESIDENCY_ROSTER_DATE]: residencyRosterData,
};
// Add live data under its date key
const LIVE_DATE = snapshotIndex[snapshotIndex.length - 1];
BUNDLED_SNAPSHOTS[LIVE_DATE] = liveData;
const PAPER_DATE = "2025-10-17";
const DEFAULT_CUSTOM_SNAPSHOT_DATE =
  [...snapshotIndex]
    .reverse()
    .find((date) => date !== LIVE_DATE && date !== PAPER_DATE) ?? LIVE_DATE;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

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
function toRealGrowthRate(nominalGrowthRate, inflationRate = INFLATION_RATE) {
  return (1 + nominalGrowthRate) / (1 + inflationRate) - 1;
}

function impliedElasticityFromLossShare(lossShare, taxRateDelta = 0.05) {
  if (taxRateDelta <= 0 || lossShare <= 0) {
    return 0;
  }

  if (lossShare >= 1) {
    return Infinity;
  }

  return -Math.log(1 - lossShare) / taxRateDelta;
}

function roundUpToNearest(value, step) {
  if (!Number.isFinite(value) || value <= 0) {
    return step;
  }

  return Math.ceil(value / step) * step;
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

function normalizeParams(nextParams) {
  return {
    ...nextParams,
    residencyExclusionIds: normalizeResidencyExclusionIds(
      nextParams.residencyExclusionIds ?? []
    ),
    incomeTaxMoverIds: normalizeIncomeTaxMoverIds(
      nextParams.incomeTaxMoverIds ?? []
    ),
  };
}

function ChartLoading() {
  return (
    <div className="h-[320px] animate-pulse rounded-[24px] border border-[var(--gray-200)] bg-[var(--gray-50)]" />
  );
}

function ExternalLinkIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
    >
      <path
        d="M11.25 3.75H16.25V8.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.75 11.25L16.25 3.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.25 11.25V13.75C16.25 15.1307 15.1307 16.25 13.75 16.25H6.25C4.86929 16.25 3.75 15.1307 3.75 13.75V6.25C3.75 4.86929 4.86929 3.75 6.25 3.75H8.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const WaterfallChart = dynamic(() => import("@/app/components/WaterfallChart"), {
  loading: () => <ChartLoading />,
});

const PRESETS = {
  saez: {
    label: "Saez headline",
    description: "Applies Saez-style static assumptions to the calculator.",
    href: "https://eml.berkeley.edu/~saez/galle-gamage-saez-shanskeCAbillionairetaxDec25.pdf",
    params: {
      snapshotDate: PAPER_DATE,
      residencyExclusionIds: [],
      departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
      wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
      excludeRealEstate: false,
      includeIncomeTaxEffects: false,
      incomeTaxMoverIds: DEFAULT_INCOME_TAX_MOVER_IDS,
      avoidanceRate: 0.1,
      unannouncedDepartureShare: 0,
      migrationSemiElasticity: 12.6,
      wealthGrowthRate: 0,
      annualReturnRate: 0,
      incomeYieldRate: 0.01,
      incomeTaxAttributionRate: 1,
      horizonYears: Infinity,
      discountRate: 0.03,
    },
  },
  rauh: {
    label: "Rauh headline",
    description: "Applies Rauh-style departures and income-tax assumptions.",
    href: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6340778",
    params: {
      snapshotDate: PAPER_DATE,
      residencyExclusionIds: normalizeResidencyExclusionIds([
        ...RESIDENCY_ONLY_EXCLUSION_IDS,
        ...PRE_SNAPSHOT_EXCLUSION_IDS,
      ]),
      departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
      wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
      excludeRealEstate: true,
      includeIncomeTaxEffects: true,
      incomeTaxMoverIds: DEFAULT_INCOME_TAX_MOVER_IDS,
      avoidanceRate: 0,
      unannouncedDepartureShare: 0.48,
      migrationSemiElasticity: 12.6,
      wealthGrowthRate: 0,
      annualReturnRate: 0,
      incomeYieldRate: 0.02,
      incomeTaxAttributionRate: 1,
      horizonYears: Infinity,
      discountRate: 0.03,
    },
  },
};

const DEFAULT_PARAMS = {
  snapshotDate: LIVE_DATE,
  residencyExclusionIds: [],
  departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
  wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
  excludeRealEstate: true,
  includeIncomeTaxEffects: false,
  incomeTaxMoverIds: DEFAULT_INCOME_TAX_MOVER_IDS,
  avoidanceRate: 0,
  unannouncedDepartureShare: 0,
  migrationSemiElasticity: 12.6,
  wealthGrowthRate: 0,
  annualReturnRate: 0,
  incomeYieldRate: 0.02,
  incomeTaxAttributionRate: 1,
  horizonYears: Infinity,
  discountRate: 0.03,
};

const formatPercent = (value, decimals = 0) =>
  `${(value * 100).toFixed(decimals)}%`;

const formatYears = (value) =>
  value === Infinity ? "Perpetuity" : `${value} years`;

function matchesPreset(params, presetParams) {
  return Object.entries(presetParams).every(
    ([key, value]) =>
      Array.isArray(value)
        ? Array.isArray(params[key]) &&
          params[key].length === value.length &&
          params[key].every((entry, index) => entry === value[index])
        : params[key] === value
  );
}

function getMatchingPresetKey(params) {
  return (
    Object.keys(PRESETS).find((key) => matchesPreset(params, PRESETS[key].params)) ??
    null
  );
}

function buildPresetDetails(params) {
  const valuationRows = getSnapshotRows(
    params.snapshotDate,
    BUNDLED_SNAPSHOTS[params.snapshotDate] ?? liveData
  );
  const residencyRows = getSnapshotRows(
    RESIDENCY_ROSTER_DATE,
    BUNDLED_SNAPSHOTS[RESIDENCY_ROSTER_DATE]
  );
  const data = buildResidencyRosterValuationRows({
    residencyRows,
    valuationRows,
  });
  const sourceDate = new Date(params.snapshotDate + "T00:00:00");
  const realGrowthRate = toRealGrowthRate(params.wealthGrowthRate);
  const incomeTaxMoverNames = incomeTaxMoverNamesFromIds(params.incomeTaxMoverIds);
  const baseMicro = computeMicroResults({
    billionaires: data,
    incomeTaxLookup,
    excludedNames: residencyExcludedNamesFromIds(params.residencyExclusionIds),
    incomeTaxMoverNames,
    excludeRealEstate: params.excludeRealEstate,
    incomeYieldRate: params.incomeYieldRate,
    wealthGrowthRate: params.wealthGrowthRate,
    unannouncedDepartureShare: 0,
    sourceDate,
  });
  const observedDepartureLossShare =
    baseMicro.correctedBaseGrossWealthTaxB > 0
      ? baseMicro.observedPreSnapshotDepartureGrossWealthTaxB /
        baseMicro.correctedBaseGrossWealthTaxB
      : 0;
  const modeledAdditionalDepartureShare = effectiveAdditionalDepartureShare({
    mode: params.departureResponseMode,
    share: params.unannouncedDepartureShare,
    totalElasticity: params.migrationSemiElasticity,
    observedLossShare: observedDepartureLossShare,
  });
  const micro = computeMicroResults({
    billionaires: data,
    incomeTaxLookup,
    excludedNames: residencyExcludedNamesFromIds(params.residencyExclusionIds),
    incomeTaxMoverNames,
    excludeRealEstate: params.excludeRealEstate,
    incomeYieldRate: params.incomeYieldRate,
    wealthGrowthRate: params.wealthGrowthRate,
    unannouncedDepartureShare: modeledAdditionalDepartureShare,
    sourceDate,
  });
  const result = calculateFiscalImpact({
    grossWealthTaxB: micro.grossWealthTaxB,
    avoidanceRate: params.avoidanceRate,
    moverIncomeTaxB: micro.moverIncomeTaxB,
    includeIncomeTaxEffects: params.includeIncomeTaxEffects,
    incomeTaxAttributionRate: params.incomeTaxAttributionRate,
    horizonYears: params.horizonYears,
    discountRate: params.discountRate,
    annualReturnRate: params.annualReturnRate,
    growthRate: realGrowthRate,
    wealthTaxPaymentMode: params.wealthTaxPaymentMode,
  });

  return { micro, result };
}

export default function Home() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [hasSyncedUrlState, setHasSyncedUrlState] = useState(false);
  const [wizardHasPath, setWizardHasPath] = useState(false);
  const [wizardPath, setWizardPath] = useState(null);
  const [wizardComplete, setWizardComplete] = useState(false);
  const [activeTab, setActiveTab] = useState("calculator");
  const [copyStatus, setCopyStatus] = useState("idle");
  const activePreset = useMemo(() => getMatchingPresetKey(params), [params]);
  const realGrowthRate = useMemo(
    () => toRealGrowthRate(params.wealthGrowthRate),
    [params.wealthGrowthRate]
  );
  const usesInstallments =
    params.wealthTaxPaymentMode === WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS;
  const isRauhScenario = activePreset === "rauh";
  const pitEffectsEnabled = params.includeIncomeTaxEffects;

  const [snapshotData, setSnapshotData] = useState(
    BUNDLED_SNAPSHOTS[params.snapshotDate] ?? liveData
  );
  const residencySnapshotRows = useMemo(
    () =>
      getSnapshotRows(
        RESIDENCY_ROSTER_DATE,
        BUNDLED_SNAPSHOTS[RESIDENCY_ROSTER_DATE]
      ),
    []
  );
  useEffect(() => {
    const date = params.snapshotDate;
    if (BUNDLED_SNAPSHOTS[date]) {
      setSnapshotData(BUNDLED_SNAPSHOTS[date]);
      return;
    }
    fetch(`${BASE_PATH}/snapshots/${date}.json`)
      .then((r) => r.json())
      .then(setSnapshotData)
      .catch(() => setSnapshotData(liveData));
  }, [params.snapshotDate]);

  const sourceDate = useMemo(
    () => new Date(params.snapshotDate + "T00:00:00"),
    [params.snapshotDate]
  );
  const valuationSnapshotRows = useMemo(
    () => getSnapshotRows(params.snapshotDate, snapshotData),
    [params.snapshotDate, snapshotData]
  );
  const snapshotRows = useMemo(
    () =>
      buildResidencyRosterValuationRows({
        residencyRows: residencySnapshotRows,
        valuationRows: valuationSnapshotRows,
      }),
    [residencySnapshotRows, valuationSnapshotRows]
  );
  const excludedNames = useMemo(
    () => residencyExcludedNamesFromIds(params.residencyExclusionIds),
    [params.residencyExclusionIds]
  );
  const incomeTaxMoverNames = useMemo(
    () => incomeTaxMoverNamesFromIds(params.incomeTaxMoverIds),
    [params.incomeTaxMoverIds]
  );

  const baseMicro = useMemo(
    () =>
      computeMicroResults({
        billionaires: snapshotRows,
        incomeTaxLookup,
        excludedNames,
        incomeTaxMoverNames,
        excludeRealEstate: params.excludeRealEstate,
        incomeYieldRate: params.incomeYieldRate,
        wealthGrowthRate: params.wealthGrowthRate,
        unannouncedDepartureShare: 0,
        sourceDate,
      }),
    [
      snapshotRows,
      sourceDate,
      excludedNames,
      incomeTaxMoverNames,
      params.excludeRealEstate,
      params.incomeYieldRate,
      params.wealthGrowthRate,
    ]
  );
  const observedDepartureLossShare = useMemo(
    () =>
      baseMicro.correctedBaseGrossWealthTaxB > 0
        ? baseMicro.observedPreSnapshotDepartureGrossWealthTaxB /
          baseMicro.correctedBaseGrossWealthTaxB
        : 0,
    [
      baseMicro.correctedBaseGrossWealthTaxB,
      baseMicro.observedPreSnapshotDepartureGrossWealthTaxB,
    ]
  );
  const usesElasticityMode =
    params.departureResponseMode === DEPARTURE_RESPONSE_MODES.ELASTICITY;
  const modeledAdditionalDepartureShare = useMemo(
    () =>
      usesElasticityMode
        ? effectiveAdditionalDepartureShare({
            mode: params.departureResponseMode,
            share: params.unannouncedDepartureShare,
            totalElasticity: params.migrationSemiElasticity,
            observedLossShare: observedDepartureLossShare,
          })
        : params.unannouncedDepartureShare,
    [
      usesElasticityMode,
      params.departureResponseMode,
      params.unannouncedDepartureShare,
      params.migrationSemiElasticity,
      observedDepartureLossShare,
    ]
  );
  const correctedBaseWealthB = useMemo(
    () =>
      baseMicro.correctedBaseRows.reduce((sum, row) => sum + row.netWorthB, 0),
    [baseMicro.correctedBaseRows]
  );
  const observedDepartureWealthB = useMemo(
    () =>
      baseMicro.observedPreSnapshotDepartureRows.reduce(
        (sum, row) => sum + row.netWorthB,
        0
      ),
    [baseMicro.observedPreSnapshotDepartureRows]
  );
  const remainingResidentWealthB = useMemo(
    () => baseMicro.stayers.reduce((sum, row) => sum + row.netWorthB, 0),
    [baseMicro.stayers]
  );

  const micro = useMemo(
    () =>
      computeMicroResults({
        billionaires: snapshotRows,
        incomeTaxLookup,
        excludedNames,
        incomeTaxMoverNames,
        excludeRealEstate: params.excludeRealEstate,
        incomeYieldRate: params.incomeYieldRate,
        wealthGrowthRate: params.wealthGrowthRate,
        unannouncedDepartureShare: modeledAdditionalDepartureShare,
        sourceDate,
      }),
    [
      snapshotRows,
      sourceDate,
      excludedNames,
      incomeTaxMoverNames,
      params.excludeRealEstate,
      params.incomeYieldRate,
      params.wealthGrowthRate,
      modeledAdditionalDepartureShare,
    ]
  );
  const result = useMemo(
    () =>
      calculateFiscalImpact({
        grossWealthTaxB: micro.grossWealthTaxB,
        avoidanceRate: params.avoidanceRate,
        moverIncomeTaxB: micro.moverIncomeTaxB,
        includeIncomeTaxEffects: params.includeIncomeTaxEffects,
        incomeTaxAttributionRate: params.incomeTaxAttributionRate,
        horizonYears: params.horizonYears,
        discountRate: params.discountRate,
        annualReturnRate: params.annualReturnRate,
        growthRate: realGrowthRate,
        wealthTaxPaymentMode: params.wealthTaxPaymentMode,
      }),
    [micro, params, realGrowthRate]
  );
  const additionalExcludedWealthB = useMemo(
    () => remainingResidentWealthB * modeledAdditionalDepartureShare,
    [remainingResidentWealthB, modeledAdditionalDepartureShare]
  );
  const totalExcludedWealthB = useMemo(
    () => observedDepartureWealthB + additionalExcludedWealthB,
    [observedDepartureWealthB, additionalExcludedWealthB]
  );
  const additionalExcludedWealthShare = useMemo(
    () =>
      remainingResidentWealthB > 0
        ? additionalExcludedWealthB / remainingResidentWealthB
        : 0,
    [additionalExcludedWealthB, remainingResidentWealthB]
  );
  const totalExcludedWealthShare = useMemo(
    () =>
      correctedBaseWealthB > 0 ? totalExcludedWealthB / correctedBaseWealthB : 0,
    [correctedBaseWealthB, totalExcludedWealthB]
  );
  const impliedTotalMigrationElasticity = useMemo(
    () => impliedElasticityFromLossShare(totalExcludedWealthShare),
    [totalExcludedWealthShare]
  );
  const additionalExcludedWealthMaxB = useMemo(
    () => roundUpToNearest(remainingResidentWealthB, 25),
    [remainingResidentWealthB]
  );
  const additionalExcludedWealthStepB = useMemo(() => {
    if (additionalExcludedWealthMaxB >= 1000) {
      return 25;
    }

    if (additionalExcludedWealthMaxB >= 250) {
      return 10;
    }

    if (additionalExcludedWealthMaxB >= 100) {
      return 5;
    }

    return 1;
  }, [additionalExcludedWealthMaxB]);
  const headlineValue = pitEffectsEnabled
    ? result.netFiscalImpact
    : result.pvWealthTaxReceipts;
  const shareHref = useMemo(() => {
    if (!hasSyncedUrlState || typeof window === "undefined") {
      return "";
    }

    const pathname = canonicalScenarioPathname(window.location.pathname);
    const href = buildScenarioHref(pathname, params, DEFAULT_PARAMS);
    return `${window.location.origin}${href}`;
  }, [hasSyncedUrlState, params]);
  const embedBasePath =
    typeof window === "undefined"
      ? "/us/california-wealth-tax"
      : window.location.pathname.replace(/\/$/, "");
  const paperWebHref = `${embedBasePath}/papers/web/index.html`;
  const paperPdfHref = `${embedBasePath}/papers/california-wealth-tax-ssrn-draft.pdf`;
  const selectedResidencyAdjustments = useMemo(
    () =>
      RESIDENCY_ADJUSTMENTS.filter((adjustment) =>
        params.residencyExclusionIds.includes(adjustment.id)
      ),
    [params.residencyExclusionIds]
  );
  const selectedIncomeTaxMovers = useMemo(
    () =>
      INCOME_TAX_MOVER_ADJUSTMENTS.filter((adjustment) =>
        params.incomeTaxMoverIds.includes(adjustment.id)
      ),
    [params.incomeTaxMoverIds]
  );
  const startingPointMeta = useMemo(() => {
    if (wizardPath === "berkeley") {
      return {
        label: "Berkeley (Saez et al.)",
        href: PRESETS.saez.href,
      };
    }

    if (wizardPath === "hoover") {
      return {
        label: "Hoover (Rauh et al.)",
        href: PRESETS.rauh.href,
      };
    }

    if (wizardPath === "custom") {
      return {
        label: "Custom",
        href: null,
      };
    }

    return {
      label: activePreset === "saez"
        ? "Berkeley (Saez et al.)"
        : activePreset === "rauh"
          ? "Hoover (Rauh et al.)"
          : "Custom",
      href:
        activePreset === "saez"
          ? PRESETS.saez.href
          : activePreset === "rauh"
            ? PRESETS.rauh.href
            : null,
    };
  }, [activePreset, wizardPath]);
  const snapshotSummaryLabel =
    params.snapshotDate === LIVE_DATE
      ? LIVE_SNAPSHOT_TIMESTAMP_LABEL
        ? `Current Forbes snapshot (${LIVE_SNAPSHOT_TIMESTAMP_LABEL})`
        : `Current Forbes snapshot (${LIVE_DATE})`
      : params.snapshotDate === PAPER_DATE
        ? "Paper snapshot (2025-10-17)"
        : `Stored Forbes snapshot (${params.snapshotDate})`;
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const parsed = normalizeParams(parseScenarioParams(searchParams, DEFAULT_PARAMS));
    const matchingPreset = getMatchingPresetKey(parsed);
    setParams(parsed);
    setHasSyncedUrlState(true);
    // If URL has scenario params, keep the wizard visible but expose results.
    if (searchParams.toString().length > 0) {
      setWizardPath(
        matchingPreset === "saez"
          ? "berkeley"
          : matchingPreset === "rauh"
            ? "hoover"
            : "custom"
      );
      setWizardHasPath(true);
      setWizardComplete(true);
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
    if (copyStatus === "idle") {
      return;
    }

    const timeout = window.setTimeout(() => setCopyStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  function update(key, value) {
    setParams((prev) => {
      const next = normalizeParams({ ...prev, [key]: value });

      return next;
    });
  }

  function toggleResidencyExclusion(id) {
    setParams((prev) => {
      const nextIds = prev.residencyExclusionIds.includes(id)
        ? prev.residencyExclusionIds.filter((value) => value !== id)
        : [...prev.residencyExclusionIds, id];

      return normalizeParams({
        ...prev,
        residencyExclusionIds: nextIds,
      });
    });
  }

  function toggleIncomeTaxMover(id) {
    setParams((prev) => {
      const nextIds = prev.incomeTaxMoverIds.includes(id)
        ? prev.incomeTaxMoverIds.filter((value) => value !== id)
        : [...prev.incomeTaxMoverIds, id];

      return normalizeParams({
        ...prev,
        incomeTaxMoverIds: nextIds,
      });
    });
  }

  function updateAdditionalExcludedWealthB(nextValue) {
    const boundedValue = Math.max(
      0,
      Math.min(remainingResidentWealthB, nextValue)
    );
    const share =
      remainingResidentWealthB > 0 ? boundedValue / remainingResidentWealthB : 0;

    setParams((prev) =>
      normalizeParams({
        ...prev,
        departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
        unannouncedDepartureShare: share,
      })
    );
  }

  function applyPreset(key) {
    setParams(normalizeParams({ ...PRESETS[key].params }));
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

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <main className="mx-auto max-w-6xl p-6">
        <div className="space-y-8">
          <section className="rounded-[30px] border border-[var(--gray-200)] bg-white px-6 py-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-3xl">
                <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--gray-700)]">
                  California wealth tax fiscal impact calculator
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--gray-500)]">
                  Compare one-time wealth-tax assumptions, then optionally add
                  future California income-tax effects from migration.
                </p>
              </div>
              <div className="inline-flex rounded-full border border-[var(--gray-200)] bg-[var(--gray-50)] p-1">
                {[
                  { key: "calculator", label: "Calculator" },
                  { key: "data", label: "Data" },
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
                    This draft explains the calculator&apos;s structure, sources,
                    and main modeling choices.
                  </p>
                </div>
                <a
                  href={paperPdfHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gray-300)] bg-white px-4 py-2 text-sm font-medium text-[var(--gray-700)] transition-colors hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                >
                  Open PDF
                  <ExternalLinkIcon className="h-3.5 w-3.5 opacity-70" />
                </a>
              </div>
              <div className="overflow-hidden rounded-[24px] border border-[var(--gray-200)] bg-white">
                <iframe
                  title="California wealth tax working paper"
                  src={paperWebHref}
                  className="h-[78vh] min-h-[720px] w-full"
                />
              </div>
            </section>
          ) : activeTab === "data" ? (
            <section className="space-y-5 rounded-[30px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-52px_rgba(40,94,97,0.45)]">
              <div className="max-w-3xl">
                <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
                  Billionaire-level data
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
                  Wealth uses the selected Forbes valuation snapshot. The
                  January 1, 2026 roster is used as the residency proxy, with
                  one-time tax liability and future income-tax mover assumptions
                  controlled in the calculator.
                </p>
              </div>
              <div className="rounded-[24px] border border-[var(--gray-200)] bg-white p-4">
                <BillionaireTable
                  rows={micro.rows}
                  avoidanceRate={params.avoidanceRate}
                  excludeRealEstate={params.excludeRealEstate}
                />
              </div>
            </section>
          ) : (
          <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="space-y-10">

              {wizardComplete ? (
                <WizardSummary
                  params={params}
                  startingPointMeta={startingPointMeta}
                  snapshotSummaryLabel={snapshotSummaryLabel}
                  selectedResidencyAdjustments={selectedResidencyAdjustments}
                  selectedIncomeTaxMovers={selectedIncomeTaxMovers}
                  additionalExcludedWealthB={additionalExcludedWealthB}
                  additionalExcludedWealthShare={additionalExcludedWealthShare}
                  totalExcludedWealthShare={totalExcludedWealthShare}
                  observedDepartureWealthB={observedDepartureWealthB}
                  impliedTotalMigrationElasticity={impliedTotalMigrationElasticity}
                  copyStatus={copyStatus}
                  shareHref={shareHref}
                  onCopyScenarioLink={copyScenarioLink}
                  onEdit={() => setWizardComplete(false)}
                />
              ) : (
                <Wizard
                  params={params}
                  update={update}
                  applyPreset={applyPreset}
                  additionalExcludedWealthB={additionalExcludedWealthB}
                  additionalExcludedWealthMaxB={additionalExcludedWealthMaxB}
                  additionalExcludedWealthStepB={additionalExcludedWealthStepB}
                  additionalExcludedWealthShare={additionalExcludedWealthShare}
                  observedDepartureWealthB={observedDepartureWealthB}
                  totalExcludedWealthB={totalExcludedWealthB}
                  totalExcludedWealthShare={totalExcludedWealthShare}
                  impliedTotalMigrationElasticity={impliedTotalMigrationElasticity}
                  updateAdditionalExcludedWealthB={updateAdditionalExcludedWealthB}
                  initialPath={wizardPath}
                  liveDate={LIVE_DATE}
                  liveSnapshotLabel={LIVE_SNAPSHOT_TIMESTAMP_LABEL}
                  paperDate={PAPER_DATE}
                  ballotMeasureUrl={BALLOT_MEASURE_URL}
                  berkeleyPaperUrl={PRESETS.saez.href}
                  hooverPaperUrl={PRESETS.rauh.href}
                  customSnapshotDate={DEFAULT_CUSTOM_SNAPSHOT_DATE}
                  snapshotDateMin={snapshotIndex[0]}
                  snapshotDateMax={LIVE_DATE}
                  resolveSnapshotDate={resolveSnapshotDate}
                  residencyAdjustments={RESIDENCY_ADJUSTMENTS}
                  toggleResidencyExclusion={toggleResidencyExclusion}
                  incomeTaxMoverAdjustments={INCOME_TAX_MOVER_ADJUSTMENTS}
                  toggleIncomeTaxMover={toggleIncomeTaxMover}
                  onDone={() => setWizardComplete(true)}
                  onPathChange={({ path, showResult }) => {
                    setWizardPath(path ?? null);
                    setWizardHasPath(!!showResult);
                  }}
                  onResetParams={() => {
                    setParams(normalizeParams({ ...DEFAULT_PARAMS }));
                    setWizardPath(null);
                    setWizardHasPath(false);
                    setWizardComplete(false);
                  }}
                />
              )}
            </div>

            <aside className="self-start rounded-[28px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_30px_80px_-48px_rgba(40,94,97,0.55)] xl:sticky xl:top-6">
              {!wizardHasPath ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-500)]">
                    Estimated fiscal impact
                  </p>
                  <div className="mt-6 text-4xl font-semibold tracking-[-0.05em] text-[var(--gray-300)]">
                    Select a starting point
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[var(--gray-500)]">
                    Choose Berkeley, Hoover, or Custom to see the estimated fiscal impact update in real time.
                  </p>
                </>
              ) : (
              <>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-500)]">
                {pitEffectsEnabled
                  ? "Net fiscal impact"
                  : "One-time wealth-tax score"}
              </p>
              <div
                className={`mt-6 text-5xl font-semibold tracking-[-0.05em] ${
                  headlineValue >= 0
                    ? "text-[var(--teal-600)]"
                    : "text-[var(--red-600)]"
                }`}
              >
                {formatBillions(headlineValue, { showPlus: true })}
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--gray-500)]">
                {pitEffectsEnabled
                  ? "Includes the optional present value of attributed future California income-tax losses."
                  : "Excludes future California income-tax losses and reports the present value of one-time wealth-tax receipts only."}
              </p>

              <div className="mt-8">
                <WaterfallChart waterfall={result.waterfall} />
              </div>
              </>
              )}

              {wizardHasPath && (
              <details className="mt-6 text-sm text-[var(--gray-600)]">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--gray-500)] hover:text-[var(--teal-700)]">
                  Derivation
                </summary>
                <div className="mt-2 divide-y divide-[var(--gray-100)]">
                  <div className="flex items-center justify-between py-2">
                    <span>Gross wealth tax (with phase-in)</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(result.grossWealthTaxB)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span>After non-migration erosion</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(result.wealthTaxCollected)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span>Payment timing</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      {usesInstallments ? "5 installments" : "Lump sum"}
                    </span>
                  </div>
                  {result.wealthTaxDeferralChargeB > 0 && (
                    <div className="flex items-center justify-between py-2">
                      <span>Nominal deferral charges</span>
                      <span className="font-semibold text-[var(--gray-700)]">
                        {formatBillions(result.wealthTaxDeferralChargeB)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2">
                    <span>PV of wealth-tax receipts</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(result.pvWealthTaxReceipts)}
                    </span>
                  </div>
                  {pitEffectsEnabled && result.annualIncomeTaxLost > 0 && (
                  <>
                  <div className="flex items-center justify-between py-2">
                    <span>Annual income tax lost (attributed)</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      ${result.annualIncomeTaxLost.toFixed(1)}B/yr
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span>PV of lost income tax</span>
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(result.pvLostIncomeTax)}
                    </span>
                  </div>
                  </>
                  )}
                </div>
              </details>
              )}
            </aside>
          </div>
          )}
        </div>
      </main>
    </div>
  );
}

function SummarySection({ title, children }) {
  return (
    <section className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--gray-500)]">
        {title}
      </h4>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function SummaryItem({ label, value, note }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="text-sm text-[var(--gray-500)]">{label}</span>
        <span className="text-sm font-semibold text-[var(--gray-700)]">
          {value}
        </span>
      </div>
      {note && (
        <p className="text-xs leading-5 text-[var(--gray-500)]">{note}</p>
      )}
    </div>
  );
}

function WizardSummary({
  params,
  startingPointMeta,
  snapshotSummaryLabel,
  selectedResidencyAdjustments,
  selectedIncomeTaxMovers,
  additionalExcludedWealthB,
  additionalExcludedWealthShare,
  totalExcludedWealthShare,
  observedDepartureWealthB,
  impliedTotalMigrationElasticity,
  copyStatus,
  shareHref,
  onCopyScenarioLink,
  onEdit,
}) {
  const residencySummary =
    selectedResidencyAdjustments.length === 0
      ? "Everyone included"
      : `${selectedResidencyAdjustments.length} excluded`;
  const residencyNote =
    selectedResidencyAdjustments.length === 0
      ? "No publicly reported moves or contested residency cases are excluded."
      : selectedResidencyAdjustments.map((adjustment) => adjustment.name).join(", ");
  const incomeTaxMoverSummary =
    selectedIncomeTaxMovers.length === 0
      ? "No named movers"
      : `${selectedIncomeTaxMovers.length} named movers`;
  const incomeTaxMoverNote =
    selectedIncomeTaxMovers.length === 0
      ? "Future income-tax effects come only from any modeled additional migration."
      : selectedIncomeTaxMovers.map((adjustment) => adjustment.name).join(", ");
  const migrationSummary = formatBillions(additionalExcludedWealthB, {
    decimals: additionalExcludedWealthB >= 100 ? 0 : 1,
  });
  const migrationNote = [
    `Named cases already remove ${formatBillions(observedDepartureWealthB, {
      decimals: observedDepartureWealthB >= 100 ? 0 : 1,
    })}.`,
    `${formatPercent(additionalExcludedWealthShare, 1)} of the remaining wealth base and ${formatPercent(totalExcludedWealthShare, 1)} of the total corrected base.`,
    `Implied total semi-elasticity: ${
      Number.isFinite(impliedTotalMigrationElasticity)
        ? impliedTotalMigrationElasticity.toFixed(1)
        : "∞"
    }.`,
  ].join(" ");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-500)]">
            Your setup
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--gray-700)]">
            Selected assumptions
          </h3>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-500)]">
            Review the current setup or jump back in to edit it.
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full border border-[var(--gray-300)] bg-white px-4 py-2 text-sm font-medium text-[var(--gray-700)] transition-colors hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
        >
          Edit selections
        </button>
      </div>

      <div className="space-y-6 rounded-[28px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_24px_70px_-50px_rgba(40,94,97,0.45)]">
        <SummarySection title="Starting point">
          <SummaryItem
            label="Scenario"
            value={startingPointMeta.label}
            note={
              startingPointMeta.href ? (
                <a
                  href={startingPointMeta.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-[var(--teal-700)] hover:text-[var(--teal-800)]"
                >
                  Read paper
                  <ExternalLinkIcon className="h-3 w-3" />
                </a>
              ) : null
            }
          />
        </SummarySection>

        <SummarySection title="Stage 1: one-time wealth tax">
          <SummaryItem
            label="Wealth snapshot"
            value={snapshotSummaryLabel}
            note={`Residency roster proxy stays fixed at ${RESIDENCY_ROSTER_DATE}.`}
          />
          <SummaryItem
            label="Residency exclusions"
            value={residencySummary}
            note={residencyNote}
          />
          <SummaryItem
            label="Directly held real estate"
            value={params.excludeRealEstate ? "Excluded" : "Included"}
          />
          <SummaryItem
            label="Payment timing"
            value={
              params.wealthTaxPaymentMode === WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS
                ? "5 installments"
                : "Lump sum"
            }
          />
          <SummaryItem
            label="Nominal wealth growth"
            value={formatPercent(params.wealthGrowthRate, 1)}
          />
          <SummaryItem
            label="Non-migration erosion"
            value={formatPercent(params.avoidanceRate)}
          />
          <SummaryItem
            label="Additional wealth outside the tax base"
            value={migrationSummary}
            note={migrationNote}
          />
        </SummarySection>

        <SummarySection title="Stage 2: optional income tax effects">
          {!params.includeIncomeTaxEffects ? (
            <SummaryItem
              label="Status"
              value="Off"
              note="The headline reports only the one-time wealth-tax score."
            />
          ) : (
            <>
              <SummaryItem
                label="Status"
                value="On"
                note="The headline also includes attributed future California personal income tax losses."
              />
              <SummaryItem
                label="Attribution to the tax"
                value={formatPercent(params.incomeTaxAttributionRate)}
              />
              <SummaryItem
                label="Named movers counted for income tax"
                value={incomeTaxMoverSummary}
                note={incomeTaxMoverNote}
              />
              <SummaryItem
                label="Annual CA-taxable income / taxed wealth"
                value={formatPercent(params.incomeYieldRate, 1)}
              />
              <SummaryItem
                label="Annual return share"
                value={formatPercent(params.annualReturnRate)}
              />
              <SummaryItem
                label="Income tax horizon"
                value={formatYears(params.horizonYears)}
              />
              <SummaryItem
                label="Real discount rate"
                value={formatPercent(params.discountRate, 1)}
              />
            </>
          )}
        </SummarySection>
      </div>

      {shareHref && (
        <div className="rounded-[24px] border border-[var(--gray-200)] bg-[var(--gray-50)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--gray-500)]">
                Share
              </p>
              <p className="mt-1 text-sm text-[var(--gray-600)]">
                Copy a link to this exact scenario.
              </p>
            </div>
            <button
              type="button"
              onClick={onCopyScenarioLink}
              className="rounded-full border border-[var(--teal-200)] bg-white px-4 py-2 text-sm font-medium text-[var(--teal-700)] transition-colors hover:border-[var(--teal-600)] hover:bg-[var(--teal-50)]"
            >
              {copyStatus === "idle" ? "Copy link" : copyStatus}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
