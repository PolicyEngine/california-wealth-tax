"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  calculateFiscalImpact,
  WEALTH_TAX_INSTALLMENT_DEFERRAL_CHARGE_RATE,
  WEALTH_TAX_PAYMENT_MODES,
} from "@/lib/calculator";
import { formatBillions } from "@/lib/format";
import {
  annotateBillionaires,
  computeMicroResults,
  estimateRealEstateHoldingsB,
  getBillionaireFlags,
  WEALTH_BASES,
} from "@/lib/microModel";
import {
  buildAnnualCashFlows,
  DEFAULT_CASH_FLOW_START_YEAR,
} from "@/lib/cashFlow";
import Slider from "@/app/components/Slider";
import {
  buildScenarioHref,
  parseScenarioParams,
} from "@/lib/scenarioUrl";
import {
  DEPARTURE_RESPONSE_MODES,
  effectiveAdditionalDepartureShare,
  impliedRemainerElasticity,
  totalLossShareFromElasticity,
} from "@/lib/departureResponse";
import billionaireMetadata from "@/data/billionaire_metadata.json";
import incomeTaxLookup from "@/data/income_tax_lookup.json";
import rauhData from "@/data/billionaires_rauh.json";
import liveData from "@/data/billionaires_live.json";
import liveMetadata from "@/data/billionaires_live_meta.json";
import snapshotIndex from "@/public/snapshots/index.json";

const BillionaireTable = dynamic(
  () => import("@/app/components/BillionaireTable"),
  { loading: () => <ChartLoading /> }
);

const CASH_FLOW_DISPLAY_YEARS = 30;
const BALLOT_MEASURE_URL =
  "https://oag.ca.gov/system/files/initiatives/pdfs/25-0024A1%20%28Billionaire%20Tax%20%29.pdf";

// CBO CPI-U forecast via PolicyEngine: ~2.45% annualized 2026–2030.
// Used to convert nominal wealth growth to real for PV discounting.
const INFLATION_RATE = 0.025;

// Bundled snapshots (always available without fetch)
const BUNDLED_SNAPSHOTS = {
  "2025-10-17": rauhData,
};
// Add live data under its date key
const LIVE_DATE = snapshotIndex[snapshotIndex.length - 1];
BUNDLED_SNAPSHOTS[LIVE_DATE] = liveData;
const PAPER_DATE = "2025-10-17";
const DEFAULT_CUSTOM_SNAPSHOT_DATE =
  [...snapshotIndex]
    .reverse()
    .find((date) => date !== LIVE_DATE && date !== PAPER_DATE) ?? LIVE_DATE;

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
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PAPER_DRAFT_PATH = `${BASE_PATH}/papers/california-wealth-tax-ssrn-draft.pdf`;

function toRealGrowthRate(nominalGrowthRate, inflationRate = INFLATION_RATE) {
  return (1 + nominalGrowthRate) / (1 + inflationRate) - 1;
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
  if (nextParams.wealthBase === WEALTH_BASES.CORRECTED_BASE) {
    return {
      ...nextParams,
      wealthBase: WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES,
    };
  }

  return nextParams;
}

function deriveBaseOptions({ snapshotDate, data, date }) {
  const dateLabel = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const rows = getSnapshotRows(snapshotDate, data);
  const classifiedRows = rows.map((row) => ({
    ...row,
    ...getBillionaireFlags(row),
  }));
  const sumBillions = (targetRows, key) =>
    targetRows.reduce((sum, row) => sum + (row[key] || 0) / 1e9, 0);
  const sumRealEstateBillions = (targetRows) =>
    targetRows.reduce(
      (sum, row) => sum + estimateRealEstateHoldingsB(row).realEstateB,
      0
    );
  const allForbesRows = classifiedRows.filter((row) => row.includeInRawForbes);
  const correctedBaseRows = classifiedRows.filter(
    (row) => !row.excludeFromCorrectedBase
  );
  const preSnapshotDepartureRows = correctedBaseRows.filter(
    (row) => row.departureTiming === "pre_snapshot"
  );
  const afterPreSnapshotRows = correctedBaseRows.filter(
    (row) => row.departureTiming !== "pre_snapshot"
  );

  return {
    [WEALTH_BASES.ALL_FORBES]: {
      label: "All Forbes CA billionaires",
      wealthB: sumBillions(allForbesRows, "netWorth"),
      realEstateB: sumRealEstateBillions(allForbesRows),
      description:
        snapshotDate === LIVE_DATE && LIVE_SNAPSHOT_TIMESTAMP_LABEL
          ? `${allForbesRows.length} billionaires in Forbes; snapshot: ${LIVE_SNAPSHOT_TIMESTAMP_LABEL}`
          : `${allForbesRows.length} billionaires in Forbes, ${dateLabel}`,
    },
    [WEALTH_BASES.CORRECTED_BASE]: {
      label: "Corrected resident base",
      wealthB: sumBillions(correctedBaseRows, "netWorth"),
      realEstateB: sumRealEstateBillions(correctedBaseRows),
      description:
        snapshotDate === "2025-10-17"
          ? `${correctedBaseRows.length} after Rauh residency corrections`
          : `${correctedBaseRows.length} after applying known residency corrections`,
    },
    [WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES]: {
      label: "After residency corrections and pre-snapshot departures",
      wealthB: sumBillions(afterPreSnapshotRows, "netWorth"),
      realEstateB: sumRealEstateBillions(afterPreSnapshotRows),
      description:
        snapshotDate === PAPER_DATE
          ? `${afterPreSnapshotRows.length} after 2 residency corrections and ${preSnapshotDepartureRows.length} confirmed pre-snapshot departures`
          : `${afterPreSnapshotRows.length} after residency corrections and removing ${preSnapshotDepartureRows.length} confirmed pre-snapshot departures`,
    },
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

const CashFlowChart = dynamic(() => import("@/app/components/CashFlowChart"), {
  loading: () => <ChartLoading />,
});

const WaterfallChart = dynamic(() => import("@/app/components/WaterfallChart"), {
  loading: () => <ChartLoading />,
});

const PRESETS = {
  saez: {
    label: "Saez headline",
    description: "Calibrated to Saez et al.'s roughly $100B static score.",
    href: "https://eml.berkeley.edu/~saez/galle-gamage-saez-shanskeCAbillionairetaxDec25.pdf",
    params: {
      snapshotDate: PAPER_DATE,
      wealthBase: WEALTH_BASES.ALL_FORBES,
      departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
      wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
      excludeRealEstate: false,
      avoidanceRate: 0.1,
      unannouncedDepartureShare: 0,
      migrationSemiElasticity: 12.6,
      wealthGrowthRate: 0,
      annualReturnRate: 0,
      incomeYieldRate: 0.01,
      horizonYears: Infinity,
      discountRate: 0.03,
    },
  },
  rauh: {
    label: "Rauh headline",
    description: "Calibrated to Rauh et al.'s revenue and net-cost headline.",
    href: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6340778",
    params: {
      snapshotDate: PAPER_DATE,
      wealthBase: WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES,
      departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
      wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
      excludeRealEstate: true,
      avoidanceRate: 0,
      unannouncedDepartureShare: 0.48,
      migrationSemiElasticity: 12.6,
      wealthGrowthRate: 0,
      annualReturnRate: 0,
      incomeYieldRate: 0.02,
      horizonYears: Infinity,
      discountRate: 0.03,
    },
  },
};

const DEFAULT_PARAMS = {
  snapshotDate: LIVE_DATE,
  wealthBase: WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES,
  departureResponseMode: DEPARTURE_RESPONSE_MODES.SHARE,
  wealthTaxPaymentMode: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
  excludeRealEstate: true,
  avoidanceRate: 0,
  unannouncedDepartureShare: 0,
  migrationSemiElasticity: 12.6,
  wealthGrowthRate: 0,
  annualReturnRate: 0,
  incomeYieldRate: 0.01,
  horizonYears: Infinity,
  discountRate: 0.03,
};

const formatPercent = (value, decimals = 0) =>
  `${(value * 100).toFixed(decimals)}%`;

const formatYears = (value) =>
  value === Infinity ? "Perpetuity" : `${value} years`;

function matchesPreset(params, presetParams) {
  return Object.entries(presetParams).every(
    ([key, value]) => params[key] === value
  );
}

function getMatchingPresetKey(params) {
  return (
    Object.keys(PRESETS).find((key) => matchesPreset(params, PRESETS[key].params)) ??
    null
  );
}

function buildPresetDetails(params) {
  const data = getSnapshotRows(
    params.snapshotDate,
    BUNDLED_SNAPSHOTS[params.snapshotDate] ?? liveData
  );
  const sourceDate = new Date(params.snapshotDate + "T00:00:00");
  const realGrowthRate = toRealGrowthRate(params.wealthGrowthRate);
  const baseMicro = computeMicroResults({
    billionaires: data,
    incomeTaxLookup,
    wealthBase: params.wealthBase,
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
    wealthBase: params.wealthBase,
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
    horizonYears: params.horizonYears,
    discountRate: params.discountRate,
    annualReturnRate: params.annualReturnRate,
    growthRate: realGrowthRate,
    wealthTaxPaymentMode: params.wealthTaxPaymentMode,
  });

  return { micro, result };
}

const PRESET_DETAILS = {
  saez: buildPresetDetails(PRESETS.saez.params),
  rauh: buildPresetDetails(PRESETS.rauh.params),
};

export default function Home() {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [hasSyncedUrlState, setHasSyncedUrlState] = useState(false);
  const [copyStatus, setCopyStatus] = useState("idle");
  const [paperExpanded, setPaperExpanded] = useState(false);
  const activePreset = useMemo(() => getMatchingPresetKey(params), [params]);
  const realGrowthRate = useMemo(
    () => toRealGrowthRate(params.wealthGrowthRate),
    [params.wealthGrowthRate]
  );
  const usesInstallments =
    params.wealthTaxPaymentMode === WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS;
  const isRauhScenario = activePreset === "rauh";

  const [snapshotData, setSnapshotData] = useState(
    BUNDLED_SNAPSHOTS[params.snapshotDate] ?? liveData
  );
  const snapshotMode =
    params.snapshotDate === PAPER_DATE
      ? "paper"
      : params.snapshotDate === LIVE_DATE
        ? "today"
        : "other";

  useEffect(() => {
    const date = params.snapshotDate;
    if (BUNDLED_SNAPSHOTS[date]) {
      setSnapshotData(BUNDLED_SNAPSHOTS[date]);
      return;
    }
    fetch(`/snapshots/${date}.json`)
      .then((r) => r.json())
      .then(setSnapshotData)
      .catch(() => setSnapshotData(liveData));
  }, [params.snapshotDate]);

  const sourceDate = useMemo(
    () => new Date(params.snapshotDate + "T00:00:00"),
    [params.snapshotDate]
  );
  const snapshotRows = useMemo(
    () => getSnapshotRows(params.snapshotDate, snapshotData),
    [params.snapshotDate, snapshotData]
  );
  const baseOptions = useMemo(
    () =>
      deriveBaseOptions({
        snapshotDate: params.snapshotDate,
        data: snapshotData,
        date: sourceDate,
      }),
    [params.snapshotDate, snapshotData, sourceDate]
  );

  const baseMicro = useMemo(
    () =>
      computeMicroResults({
        billionaires: snapshotRows,
        incomeTaxLookup,
        wealthBase: params.wealthBase,
        excludeRealEstate: params.excludeRealEstate,
        incomeYieldRate: params.incomeYieldRate,
        wealthGrowthRate: params.wealthGrowthRate,
        unannouncedDepartureShare: 0,
        sourceDate,
      }),
    [
      snapshotRows,
      sourceDate,
      params.wealthBase,
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
  const elasticityModeEnabled =
    params.wealthBase === WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES;
  const usesElasticityMode =
    elasticityModeEnabled &&
    params.departureResponseMode === DEPARTURE_RESPONSE_MODES.ELASTICITY;
  const totalDepartureLossShare = useMemo(
    () => totalLossShareFromElasticity(params.migrationSemiElasticity),
    [params.migrationSemiElasticity]
  );
  const rauhLinearizedResidualShare = useMemo(() => {
    if (observedDepartureLossShare >= 1) {
      return 0;
    }

    const linearizedTotalLossShare = Math.min(
      1,
      PRESETS.rauh.params.migrationSemiElasticity * 0.05
    );

    if (linearizedTotalLossShare <= observedDepartureLossShare) {
      return 0;
    }

    return (
      (linearizedTotalLossShare - observedDepartureLossShare) /
      (1 - observedDepartureLossShare)
    );
  }, [observedDepartureLossShare]);
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
  const impliedResidualElasticity = useMemo(
    () =>
      usesElasticityMode
        ? impliedRemainerElasticity({
            totalElasticity: params.migrationSemiElasticity,
            observedLossShare: observedDepartureLossShare,
          })
        : 0,
    [usesElasticityMode, params.migrationSemiElasticity, observedDepartureLossShare]
  );

  const micro = useMemo(
    () =>
      computeMicroResults({
        billionaires: snapshotRows,
        incomeTaxLookup,
        wealthBase: params.wealthBase,
        excludeRealEstate: params.excludeRealEstate,
        incomeYieldRate: params.incomeYieldRate,
        wealthGrowthRate: params.wealthGrowthRate,
        unannouncedDepartureShare: modeledAdditionalDepartureShare,
        sourceDate,
      }),
    [
      snapshotRows,
      sourceDate,
      params.wealthBase,
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
        horizonYears: params.horizonYears,
        discountRate: params.discountRate,
        annualReturnRate: params.annualReturnRate,
        growthRate: realGrowthRate,
        wealthTaxPaymentMode: params.wealthTaxPaymentMode,
      }),
    [micro, params, realGrowthRate]
  );
  const cashFlow = useMemo(
    () =>
      buildAnnualCashFlows({
        wealthTaxCollected: result.wealthTaxCollected,
        wealthTaxPaymentMode: params.wealthTaxPaymentMode,
        annualIncomeTaxLost: result.annualIncomeTaxLost,
        annualReturnRate: params.annualReturnRate,
        discountRate: params.discountRate,
        horizonYears: params.horizonYears,
        displayYears: CASH_FLOW_DISPLAY_YEARS,
        startYear: DEFAULT_CASH_FLOW_START_YEAR,
        growthRate: realGrowthRate,
      }),
    [params, realGrowthRate, result]
  );

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setParams(normalizeParams(parseScenarioParams(searchParams, DEFAULT_PARAMS)));
    setHasSyncedUrlState(true);
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

      if (
        key === "wealthBase" &&
        value !== WEALTH_BASES.AFTER_PRE_SNAPSHOT_DEPARTURES &&
        prev.departureResponseMode === DEPARTURE_RESPONSE_MODES.ELASTICITY
      ) {
        next.departureResponseMode = DEPARTURE_RESPONSE_MODES.SHARE;
      }

      return next;
    });
  }

  function updateSnapshotMode(nextMode) {
    if (nextMode === "paper") {
      update("snapshotDate", PAPER_DATE);
      return;
    }

    if (nextMode === "today") {
      update("snapshotDate", LIVE_DATE);
      return;
    }

    update(
      "snapshotDate",
      snapshotMode === "other" ? params.snapshotDate : DEFAULT_CUSTOM_SNAPSHOT_DATE
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
      <header className="bg-[var(--teal-700)] px-6 py-4 text-white">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-xl font-bold">
            California wealth tax fiscal impact calculator
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-3 pb-2">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <span
                key={key}
                className={`inline-flex items-center gap-1 rounded-full border p-1 ${
                  activePreset === key
                    ? "border-[var(--teal-600)] bg-[var(--teal-50)]"
                    : "border-[var(--gray-300)] bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    activePreset === key
                      ? "bg-[var(--teal-700)] text-white"
                      : "bg-white text-[var(--gray-700)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                  }`}
                  title={preset.description}
                >
                  {preset.label}
                </button>
                <a
                  href={preset.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] transition-colors ${
                    activePreset === key
                      ? "text-[var(--teal-700)] hover:bg-white hover:text-[var(--teal-800)]"
                      : "text-[var(--gray-500)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                  }`}
                  title="Read the paper"
                >
                  Read paper
                  <ExternalLinkIcon className="h-3 w-3 opacity-75" />
                </a>
              </span>
            ))}
            <button
              type="button"
              onClick={copyScenarioLink}
              className="rounded-full border border-[var(--teal-200)] bg-[var(--teal-50)] px-4 py-2 text-sm font-medium text-[var(--teal-700)] transition-colors hover:border-[var(--teal-600)] hover:bg-white"
            >
              {copyStatus === "idle" ? "Copy scenario link" : copyStatus}
            </button>
            <a
              href={BALLOT_MEASURE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gray-300)] bg-white px-4 py-2 text-sm font-medium text-[var(--gray-700)] transition-colors hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
            >
              Ballot measure text
              <ExternalLinkIcon className="h-3.5 w-3.5 opacity-70" />
            </a>
          </div>

          <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="space-y-10">

              <AssumptionSection title="Tax base">
                <div className="space-y-3 py-4">
                  <p className="text-sm font-semibold tracking-[-0.01em] text-[var(--gray-700)]">
                    Forbes snapshot
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "paper", label: "2025-10-17" },
                      { key: "today", label: "Today" },
                      { key: "other", label: "Other snapshot" },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => updateSnapshotMode(option.key)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                          snapshotMode === option.key
                            ? "border-[var(--teal-600)] bg-[var(--teal-700)] text-white"
                            : "border-[var(--gray-300)] bg-white text-[var(--gray-700)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {snapshotMode === "other" && (
                    <div className="space-y-2">
                      <input
                        type="date"
                        value={params.snapshotDate}
                        min={snapshotIndex[0]}
                        max={LIVE_DATE}
                        onChange={(e) =>
                          update(
                            "snapshotDate",
                            resolveSnapshotDate(e.target.value)
                          )
                        }
                        className="rounded-full border border-[var(--gray-300)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--gray-700)]"
                      />
                      <p className="text-xs leading-5 text-[var(--gray-500)]">
                        Loads the nearest stored daily snapshot on or before the
                        selected date.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2 py-4">
                  <p className="text-sm font-semibold tracking-[-0.01em] text-[var(--gray-700)]">
                    Who is included?
                  </p>
                  <div className="space-y-2">
                    {Object.entries(baseOptions)
                      .filter(([key]) => key !== WEALTH_BASES.CORRECTED_BASE)
                      .map(([key, option]) => (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                          params.wealthBase === key
                            ? "border-[var(--teal-600)] bg-[var(--teal-50)]"
                            : "border-[var(--gray-200)] bg-white hover:border-[var(--gray-300)]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="wealthBase"
                          value={key}
                          checked={params.wealthBase === key}
                          onChange={() => update("wealthBase", key)}
                          className="accent-[var(--teal-600)]"
                        />
                        <div>
                          <span className="text-sm font-semibold text-[var(--gray-700)]">
                            {option.label}
                          </span>
                          <span className="ml-2 text-sm text-[var(--gray-500)]">
                            ${option.wealthB.toLocaleString(undefined, { maximumFractionDigits: 0 })}B
                          </span>
                          <p className="text-xs text-[var(--gray-500)]">
                            {option.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="py-3">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={params.excludeRealEstate}
                      onChange={(e) =>
                        update("excludeRealEstate", e.target.checked)
                      }
                      className="h-4 w-4 rounded accent-[var(--teal-600)]"
                    />
                    <div>
                      <span className="text-sm font-semibold text-[var(--gray-700)]">
                        Exclude directly-held real estate
                      </span>
                      <span className="ml-2 text-sm text-[var(--gray-500)]">
                        −$
                        {(
                          baseOptions[params.wealthBase]?.realEstateB ?? 0
                        ).toFixed(1)}
                        B
                      </span>
                    </div>
                  </label>
                  <p className="mt-2 text-xs leading-5 text-[var(--gray-500)]">
                    The measure text excludes directly held real property from
                    &nbsp;net worth. Missing billionaire-level real estate
                    values are imputed at 0.64% of net worth, following Rauh et
                    al.
                  </p>
                </div>

                <Slider
                  label="Non-migration erosion of tax base"
                  value={params.avoidanceRate}
                  onChange={(nextValue) => update("avoidanceRate", nextValue)}
                  min={0}
                  max={0.5}
                  step={0.01}
                  format={(value) => formatPercent(value)}
                  quickPicks={[
                    { label: "0%", value: 0 },
                    { label: "5%", value: 0.05 },
                    { label: "10%", value: 0.1 },
                    { label: "15%", value: 0.15 },
                  ]}
                />
                <p className="py-3 text-xs leading-5 text-[var(--gray-500)]">
                  This reduces one-time wealth-tax collections only. Migration is
                  modeled below and also flows through to California income-tax
                  loss.
                </p>

                <div className="space-y-3 py-4">
                  <p className="text-sm font-semibold tracking-[-0.01em] text-[var(--gray-700)]">
                    Wealth-tax payment timing
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      {
                        key: WEALTH_TAX_PAYMENT_MODES.LUMP_SUM,
                        label: "Lump sum",
                      },
                      {
                        key: WEALTH_TAX_PAYMENT_MODES.INSTALLMENTS,
                        label: "5 installments",
                      },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => update("wealthTaxPaymentMode", option.key)}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                          params.wealthTaxPaymentMode === option.key
                            ? "border-[var(--teal-600)] bg-[var(--teal-700)] text-white"
                            : "border-[var(--gray-300)] bg-white text-[var(--gray-700)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs leading-5 text-[var(--gray-500)]">
                    {usesInstallments
                      ? `Billionaires may pay five equal annual principal payments with a ${formatPercent(WEALTH_TAX_INSTALLMENT_DEFERRAL_CHARGE_RATE, 1)} nondeductible deferral charge on the remaining unpaid balance.`
                      : "Lump sum books the wealth-tax inflow at model start."}
                  </p>
                </div>

                <div className="space-y-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold tracking-[-0.01em] text-[var(--gray-700)]">
                      Additional migration response
                    </p>
                    {elasticityModeEnabled && (
                      <div className="flex flex-wrap gap-2">
                        {[
                          {
                            key: DEPARTURE_RESPONSE_MODES.SHARE,
                            label: "% of remaining base",
                          },
                          {
                            key: DEPARTURE_RESPONSE_MODES.ELASTICITY,
                            label: "Elasticity",
                          },
                        ].map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() =>
                              update("departureResponseMode", option.key)
                            }
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                              params.departureResponseMode === option.key
                                ? "bg-[var(--teal-700)] text-white"
                                : "bg-[var(--gray-100)] text-[var(--gray-600)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {usesElasticityMode ? (
                    <>
                      <Slider
                        label="Overall migration semi-elasticity"
                        value={params.migrationSemiElasticity}
                        onChange={(nextValue) =>
                          update("migrationSemiElasticity", nextValue)
                        }
                        min={0}
                        max={20}
                        step={0.1}
                        format={(value) => value.toFixed(1)}
                        quickPicks={[
                          { label: "8.3", value: 8.3 },
                          { label: "10.3", value: 10.3 },
                          { label: "12.6", value: 12.6 },
                        ]}
                      />
                      <p className="text-xs leading-5 text-[var(--gray-500)]">
                        Confirmed pre-snapshot departures already remove{" "}
                        <span className="font-semibold text-[var(--gray-700)]">
                          {formatPercent(observedDepartureLossShare, 1)}
                        </span>{" "}
                        of the corrected tax base. An overall elasticity of{" "}
                        <span className="font-semibold text-[var(--gray-700)]">
                          {params.migrationSemiElasticity.toFixed(1)}
                        </span>{" "}
                        maps to{" "}
                        <span className="font-semibold text-[var(--gray-700)]">
                          {formatPercent(totalDepartureLossShare, 1)}
                        </span>{" "}
                        total base loss using{" "}
                        <span className="font-semibold text-[var(--gray-700)]">
                          1 - exp(-ε × 5%)
                        </span>
                        . The residual response among remaining residents is{" "}
                        <span className="font-semibold text-[var(--gray-700)]">
                          {formatPercent(modeledAdditionalDepartureShare, 1)}
                        </span>{" "}
                        of the remaining base, or an elasticity of{" "}
                        <span className="font-semibold text-[var(--gray-700)]">
                          {impliedResidualElasticity.toFixed(1)}
                        </span>
                        .
                      </p>
                    </>
                  ) : (
                    <>
                      <Slider
                        label={
                          elasticityModeEnabled
                            ? "Additional departure share of remaining base"
                            : "Additional unannounced departures"
                        }
                        value={params.unannouncedDepartureShare}
                        onChange={(nextValue) =>
                          update("unannouncedDepartureShare", nextValue)
                        }
                        min={0}
                        max={1}
                        step={0.01}
                        format={(value) => formatPercent(value)}
                        quickPicks={[
                          { label: "0%", value: 0 },
                          { label: "25%", value: 0.25 },
                          { label: "48%", value: 0.48 },
                          { label: "100%", value: 1 },
                        ]}
                      />
                      {elasticityModeEnabled && (
                        <p className="text-xs leading-5 text-[var(--gray-500)]">
                          This is the additional loss applied after the confirmed
                          pre-snapshot departures already removed{" "}
                          <span className="font-semibold text-[var(--gray-700)]">
                            {formatPercent(observedDepartureLossShare, 1)}
                          </span>{" "}
                          of the corrected tax base. On this snapshot,
                          Rauh&apos;s 12.6
                          literature-calibrated elasticity corresponds to about{" "}
                          <span className="font-semibold text-[var(--gray-700)]">
                            {formatPercent(rauhLinearizedResidualShare, 1)}
                          </span>{" "}
                          of the remaining base under the paper&apos;s linear
                          conversion.
                        </p>
                      )}
                    </>
                  )}
                </div>

                <Slider
                  label="Nominal wealth growth"
                  value={params.wealthGrowthRate}
                  onChange={(nextValue) =>
                    update("wealthGrowthRate", nextValue)
                  }
                  min={0}
                  max={0.15}
                  step={0.005}
                  format={(value) => formatPercent(value, 1)}
                  quickPicks={[
                    { label: "0%", value: 0 },
                    { label: "5%", value: 0.05 },
                    { label: "10%", value: 0.1 },
                  ]}
                />
                <p className="py-3 text-xs leading-5 text-[var(--gray-500)]">
                  Income-tax losses grow at an implied real rate of{" "}
                  <span className="font-semibold text-[var(--gray-700)]">
                    {formatPercent(realGrowthRate, 1)}
                  </span>
                  {" "}
                  after subtracting{" "}
                  {formatPercent(INFLATION_RATE, 1)} inflation.
                </p>

                <div className="flex items-center justify-between border-t border-[var(--gray-100)] py-4">
                  <span className="text-sm font-semibold text-[var(--gray-600)]">
                    PV of wealth-tax receipts
                  </span>
                  <span className="text-sm font-semibold text-[var(--teal-700)]">
                    {formatBillions(result.pvWealthTaxReceipts)}
                  </span>
                </div>
              </AssumptionSection>

              {(micro.movers.length > 0 || modeledAdditionalDepartureShare > 0) && (
                <AssumptionSection title="Income tax loss from departures">
                  <Slider
                    label="Share of remaining leavers who return each year"
                    value={params.annualReturnRate}
                    onChange={(nextValue) =>
                      update("annualReturnRate", nextValue)
                    }
                    min={0}
                    max={0.5}
                    step={0.01}
                    format={(value) => formatPercent(value)}
                    quickPicks={[
                      { label: "0%", value: 0 },
                      { label: "5%", value: 0.05 },
                      { label: "15%", value: 0.15 },
                    ]}
                  />

                  <Slider
                    label="Annual CA-taxable income / taxed wealth"
                    value={params.incomeYieldRate}
                    onChange={(nextValue) => update("incomeYieldRate", nextValue)}
                    min={0.005}
                    max={0.05}
                    step={0.001}
                    format={(value) => formatPercent(value, 1)}
                    quickPicks={[
                      { label: "1%", value: 0.01 },
                      { label: isRauhScenario ? "2% Rauh" : "2%", value: 0.02 },
                      { label: "3%", value: 0.03 },
                    ]}
                  />
                  {isRauhScenario && params.incomeYieldRate === 0.02 && (
                    <p className="rounded-2xl border border-[var(--teal-200)] bg-[var(--teal-50)] px-3 py-2 text-xs leading-5 text-[var(--teal-700)]">
                      The Rauh preset backs this{" "}
                      <span className="font-semibold">2.0%</span> value out so
                      PolicyEngine matches the paper&apos;s annual PIT midpoint.
                      Rauh et al. estimate PIT directly from FTB data rather
                      than from income divided by wealth.
                    </p>
                  )}

                  <Slider
                    label="Income tax horizon"
                    value={
                      params.horizonYears === Infinity ? 100 : params.horizonYears
                    }
                    onChange={(nextValue) =>
                      update(
                        "horizonYears",
                        nextValue >= 100 ? Infinity : nextValue
                      )
                    }
                    min={5}
                    max={100}
                    step={5}
                    format={(value) =>
                      formatYears(value >= 100 ? Infinity : value)
                    }
                    quickPicks={[
                      { label: "10y", value: 10 },
                      { label: "30y", value: 30 },
                      { label: "Perpetuity", value: 100 },
                    ]}
                  />

                  <Slider
                    label="Real discount rate"
                    value={params.discountRate}
                    onChange={(nextValue) => update("discountRate", nextValue)}
                    min={0}
                    max={0.05}
                    step={0.005}
                    format={(value) => formatPercent(value, 1)}
                    quickPicks={[
                      { label: "0%", value: 0 },
                      { label: "1.5%", value: 0.015 },
                      { label: "3%", value: 0.03 },
                      { label: "4.5%", value: 0.045 },
                    ]}
                  />
                  <div className="py-3 text-sm text-[var(--gray-600)]">
                    {micro.knownDepartureRows.length > 0 && (
                      <span>
                        <span className="font-semibold text-[var(--gray-700)]">
                          {micro.preSnapshotDepartureRows.length} pre-snapshot
                          departures
                        </span>
                        {(micro.postSnapshotDepartureRows.length > 0 ||
                          micro.unconfirmedDepartureRows.length > 0) && (
                          <span>
                            {" "}
                            +{" "}
                            {micro.postSnapshotDepartureRows.length +
                              micro.unconfirmedDepartureRows.length}{" "}
                            post-snapshot / reported
                          </span>
                        )}
                        {modeledAdditionalDepartureShare > 0 && (
                          <span>
                            {" "}
                            +{" "}
                            {formatPercent(modeledAdditionalDepartureShare)}{" "}
                            {usesElasticityMode
                              ? "modeled additional"
                              : "additional"}
                          </span>
                        )}
                        {" → "}
                      </span>
                    )}
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(micro.moverIncomeTaxB)}/yr
                    </span>{" "}
                    in lost CA income tax.
                  </div>
                </AssumptionSection>
              )}
            </div>

            <aside className="self-start rounded-[28px] border border-[var(--gray-200)] bg-white p-6 shadow-[0_30px_80px_-48px_rgba(40,94,97,0.55)] xl:sticky xl:top-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--gray-500)]">
                Net fiscal impact
              </p>
              <div
                className={`mt-6 text-5xl font-semibold tracking-[-0.05em] ${
                  result.netFiscalImpact >= 0
                    ? "text-[var(--teal-600)]"
                    : "text-[var(--red-600)]"
                }`}
              >
                {formatBillions(result.netFiscalImpact, { showPlus: true })}
              </div>

              <div className="mt-8">
                <WaterfallChart waterfall={result.waterfall} />
              </div>

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
                  {result.annualIncomeTaxLost > 0 && (
                  <>
                  <div className="flex items-center justify-between py-2">
                    <span>Annual income tax lost</span>
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
            </aside>
          </div>
        </div>

        <section className="space-y-4 border-t border-[var(--gray-200)] pt-10">
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--gray-700)]">
            Year-by-year cash flow
          </h3>
          <p className="text-xs leading-5 text-[var(--gray-500)]">
            {usesInstallments
              ? `Wealth-tax receipts are shown as five annual installments with a ${formatPercent(WEALTH_TAX_INSTALLMENT_DEFERRAL_CHARGE_RATE, 1)} nondeductible deferral charge on the remaining unpaid balance.`
              : "Wealth-tax receipts are shown as a lump sum at model start."}{" "}
            PIT losses grow in real terms using the implied growth rate above.
          </p>
          <div className="rounded-[28px] border border-[var(--gray-200)] bg-white p-5 shadow-[0_30px_80px_-48px_rgba(40,94,97,0.45)]">
            <CashFlowChart data={cashFlow.rows} />
          </div>
          {cashFlow.isTruncated && (
            <p className="text-xs leading-5 text-[var(--gray-400)]">
              The chart shows the first {cashFlow.displayedYears} years. The
              headline PV still uses the full
              {params.horizonYears === Infinity
                ? " perpetuity assumption."
                : ` ${params.horizonYears}-year horizon.`}
            </p>
          )}
        </section>

        <section className="space-y-4 border-t border-[var(--gray-200)] pt-10">
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-[var(--gray-700)]">
            Billionaire-level detail
          </h3>
          <div className="rounded-[28px] border border-[var(--gray-200)] bg-white p-5 shadow-[0_30px_80px_-48px_rgba(40,94,97,0.45)]">
            <BillionaireTable
              rows={micro.rows}
              avoidanceRate={params.avoidanceRate}
              excludeRealEstate={params.excludeRealEstate}
            />
          </div>
          <p className="text-xs leading-5 text-[var(--gray-400)]">
            Wealth from Forbes snapshots. Departure timing from Rauh et al.
            Tables 6 and 7; directly held real estate uses name-level values
            where available and otherwise imputes 0.64% of net worth, matching
            the{" "}
            <a
              href={BALLOT_MEASURE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--teal-600)]"
            >
              ballot measure text
            </a>
            . Paper correction metadata from{" "}
            <a
              href="https://github.com/bjaros20/wealth_tax"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--teal-600)]"
            >
              Rauh et al.
            </a>
            . CA income tax from{" "}
            <a
              href="https://github.com/PolicyEngine/policyengine-us"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[var(--teal-600)]"
            >
              PolicyEngine
            </a>{" "}
            (MFJ, 2026–2030).
          </p>
        </section>

        <details className="group border-t border-[var(--gray-200)] pt-6">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--gray-600)] hover:text-[var(--teal-700)]">
            Calibration notes
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-4 text-sm leading-6 text-[var(--gray-600)] xl:grid-cols-2">
            <div className="space-y-2 rounded-[20px] bg-[var(--gray-50)] p-4">
              <p className="font-semibold text-[var(--gray-700)]">
                <a
                  href={PRESETS.saez.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-[var(--gray-300)] underline-offset-2 hover:decoration-[var(--teal-600)]"
                >
                  Galle, Gamage, Saez &amp; Shanske (2026)
                </a>
              </p>
              <p>
                Uses the raw Forbes California list of{" "}
                {PRESET_DETAILS.saez.micro.rawForbesRows.length} billionaires.
                After{" "}
                {formatPercent(PRESETS.saez.params.avoidanceRate)} non-migration
                erosion
                the tax collects about{" "}
                {formatBillions(PRESET_DETAILS.saez.result.wealthTaxCollected)},
                close to the paper&apos;s roughly $100B headline.
              </p>
            </div>

            <div className="space-y-2 rounded-[20px] bg-[var(--gray-50)] p-4">
              <p className="font-semibold text-[var(--gray-700)]">
                <a
                  href={PRESETS.rauh.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-[var(--gray-300)] underline-offset-2 hover:decoration-[var(--teal-600)]"
                >
                  Rauh, Jaros, Kearney, Doran &amp; Cosso (2026)
                </a>
              </p>
              <p>
                Starts from Rauh&apos;s corrected{" "}
                {PRESET_DETAILS.rauh.micro.correctedBaseRows.length}-person base,
                removes{" "}
                {PRESET_DETAILS.rauh.micro.preSnapshotDepartureRows.length}{" "}
                confirmed pre-snapshot departures from the wealth-tax base,
                keeps{" "}
                {PRESET_DETAILS.rauh.micro.postSnapshotDepartureRows.length +
                  PRESET_DETAILS.rauh.micro.unconfirmedDepartureRows.length}{" "}
                later / reported departures on the PIT-loss side, excludes
                directly held real estate, and applies no additional
                non-migration erosion. The preset books the wealth-tax inflow as
                a lump sum.
                The default migration input is{" "}
                {formatPercent(PRESETS.rauh.params.unannouncedDepartureShare)}
                {" "}
                of the remaining base, corresponding to Rauh&apos;s 12.6
                literature-calibrated elasticity under the paper&apos;s linear
                conversion. Net wealth tax collected:{" "}
                {formatBillions(PRESET_DETAILS.rauh.result.wealthTaxCollected)}.
              </p>
              <p className="text-xs leading-5 text-[var(--gray-500)]">
                Annual CA-taxable income / wealth of{" "}
                {formatPercent(PRESETS.rauh.params.incomeYieldRate, 1)} is
                backed out by this app to match the paper&apos;s roughly -$25B
                Monte Carlo mean headline; Rauh et al. instead estimate annual
                PIT from FTB data.{" "}
                {formatPercent(PRESETS.rauh.params.discountRate, 1)} real
                discount rate, {formatPercent(INFLATION_RATE, 1)} CBO
                inflation forecast, perpetuity horizon.
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-[var(--gray-500)]">
            Both presets are simplified calibrations, not full replications.
            Wealth growth is nominal; the real discount rate is adjusted by a{" "}
            {formatPercent(INFLATION_RATE, 1)} inflation assumption (CBO
            CPI-U forecast via PolicyEngine). CA income tax from
            PolicyEngine (married filing jointly, 2026–2030). Elasticity mode
            uses the exact semi-elasticity mapping{" "}
            <span className="font-semibold text-[var(--gray-700)]">
              1 - exp(-ε × Δτ)
            </span>
            , not the linear{" "}
            <span className="font-semibold text-[var(--gray-700)]">
              ε × Δτ
            </span>{" "}
            approximation.
          </p>
        </details>

        <details
          className="group border-t border-[var(--gray-200)] pt-6"
          onToggle={(event) => setPaperExpanded(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-semibold text-[var(--gray-600)] hover:text-[var(--teal-700)]">
            Working paper (draft)
          </summary>
          <div className="mt-4 space-y-4">
            <p className="text-sm leading-6 text-[var(--gray-600)]">
              Draft SSRN-style paper describing the calculator methodology,
              current baseline, and the main differences between the Berkeley,
              Rauh, and Hoopes framings.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={PAPER_DRAFT_PATH}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gray-300)] bg-white px-4 py-2 text-sm font-medium text-[var(--gray-700)] transition-colors hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
              >
                Open PDF
                <ExternalLinkIcon className="h-3.5 w-3.5 opacity-70" />
              </a>
              <a
                href={PAPER_DRAFT_PATH}
                download
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--gray-300)] bg-white px-4 py-2 text-sm font-medium text-[var(--gray-700)] transition-colors hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
              >
                Download PDF
              </a>
            </div>
            {paperExpanded && (
              <div className="overflow-hidden rounded-[28px] border border-[var(--gray-200)] bg-white shadow-[0_30px_80px_-48px_rgba(40,94,97,0.45)]">
                <iframe
                  src={`${PAPER_DRAFT_PATH}#view=FitH`}
                  title="California wealth tax working paper draft"
                  className="h-[880px] w-full"
                />
              </div>
            )}
          </div>
        </details>
      </main>
    </div>
  );
}

function AssumptionSection({ title, children }) {
  return (
    <section className="space-y-4 border-t border-[var(--gray-200)] pt-6 first:border-t-0 first:pt-0">
      <h4 className="text-lg font-semibold tracking-[-0.02em] text-[var(--gray-700)]">
        {title}
      </h4>
      <div className="divide-y divide-[var(--gray-100)]">{children}</div>
    </section>
  );
}
