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
  buildResidencyRosterValuationRows,
  computeMicroResults,
  estimateRealEstateHoldingsB,
  getBillionaireFlags,
} from "@/lib/microModel";
import Slider from "@/app/components/Slider";
import Wizard from "@/app/components/Wizard";
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
import {
  PRE_SNAPSHOT_EXCLUSION_IDS,
  RESIDENCY_ADJUSTMENTS,
  RESIDENCY_ONLY_EXCLUSION_IDS,
  RESIDENCY_ROSTER_DATE,
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
  };
}

function deriveResidencyRosterOption({ snapshotDate, data, date }) {
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

  return {
    label: "Forbes California roster used for residency proxy",
    wealthB: sumBillions(allForbesRows, "netWorth"),
    realEstateB: sumRealEstateBillions(allForbesRows),
    description:
      snapshotDate === LIVE_DATE && LIVE_SNAPSHOT_TIMESTAMP_LABEL
        ? `${allForbesRows.length} billionaires in Forbes; snapshot: ${LIVE_SNAPSHOT_TIMESTAMP_LABEL}`
        : `${allForbesRows.length} billionaires in Forbes, ${dateLabel}`,
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

function InfoIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
    >
      <circle
        cx="10"
        cy="10"
        r="6.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M10 8V12.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="5.9" r="0.9" fill="currentColor" />
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
    description: "Applies Rauh-style departures and PIT assumptions.",
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
  avoidanceRate: 0,
  unannouncedDepartureShare: 0,
  migrationSemiElasticity: 12.6,
  wealthGrowthRate: 0,
  annualReturnRate: 0,
  incomeYieldRate: 0.01,
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
  const baseMicro = computeMicroResults({
    billionaires: data,
    incomeTaxLookup,
    excludedNames: residencyExcludedNamesFromIds(params.residencyExclusionIds),
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
  const showWizard = true;
  const [wizardHasPath, setWizardHasPath] = useState(false);
  const [wizardComplete, setWizardComplete] = useState(false);
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
  const valuationSnapshotRows = useMemo(
    () => getSnapshotRows(params.snapshotDate, snapshotData),
    [params.snapshotDate, snapshotData]
  );
  const residencyRosterOption = useMemo(
    () =>
      deriveResidencyRosterOption({
        snapshotDate: RESIDENCY_ROSTER_DATE,
        data: BUNDLED_SNAPSHOTS[RESIDENCY_ROSTER_DATE],
        date: new Date(`${RESIDENCY_ROSTER_DATE}T00:00:00`),
      }),
    []
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

  const baseMicro = useMemo(
    () =>
      computeMicroResults({
        billionaires: snapshotRows,
        incomeTaxLookup,
        excludedNames,
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
        excludedNames,
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
  const headlineValue = pitEffectsEnabled
    ? result.netFiscalImpact
    : result.pvWealthTaxReceipts;
  const attributedMoverIncomeTaxB =
    micro.moverIncomeTaxB * params.incomeTaxAttributionRate;
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const parsed = normalizeParams(parseScenarioParams(searchParams, DEFAULT_PARAMS));
    setParams(parsed);
    setHasSyncedUrlState(true);
    // If URL has scenario params, keep the wizard visible but expose results.
    if (searchParams.toString().length > 0) {
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
          {wizardComplete && (
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
          )}

          <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="space-y-10">

              {showWizard ? (
                <Wizard
                  params={params}
                  update={update}
                  applyPreset={applyPreset}
                  liveDate={LIVE_DATE}
                  paperDate={PAPER_DATE}
                  customSnapshotDate={DEFAULT_CUSTOM_SNAPSHOT_DATE}
                  snapshotDateMin={snapshotIndex[0]}
                  snapshotDateMax={LIVE_DATE}
                  resolveSnapshotDate={resolveSnapshotDate}
                  residencyAdjustments={RESIDENCY_ADJUSTMENTS}
                  toggleResidencyExclusion={toggleResidencyExclusion}
                  onDone={() => setWizardComplete(true)}
                  onPathChange={(p) => setWizardHasPath(!!p)}
                  onResetParams={() => {
                    setParams(normalizeParams({ ...DEFAULT_PARAMS }));
                    setWizardHasPath(false);
                    setWizardComplete(false);
                  }}
                />
              ) : (
              <>
              <AssumptionSection title="Stage 1: one-time wealth tax">
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

                <div className="space-y-3 py-4">
                  <p className="text-sm font-semibold tracking-[-0.01em] text-[var(--gray-700)]">
                    Residency roster proxy
                  </p>
                  <div className="rounded-2xl border border-[var(--gray-200)] bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--gray-700)]">
                        Forbes California billionaires on {RESIDENCY_ROSTER_DATE}
                      </span>
                      <span className="text-sm text-[var(--gray-500)]">
                        {residencyRosterOption.description}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[var(--gray-500)]">
                      This fixed January 1, 2026 roster is used only as a proxy
                      for who might be in the tax base. Wealth is valued using
                      the selected snapshot above.
                    </p>
                  </div>
                </div>

                <details className="rounded-2xl border border-[var(--gray-200)] bg-white px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold tracking-[-0.01em] text-[var(--gray-700)] hover:text-[var(--teal-700)]">
                    Residency adjustments
                    {params.residencyExclusionIds.length > 0 && (
                      <span className="ml-2 text-xs font-medium text-[var(--gray-500)]">
                        ({params.residencyExclusionIds.length} excluded)
                      </span>
                    )}
                  </summary>
                  <p className="mt-3 text-xs leading-5 text-[var(--gray-500)]">
                    Toggle whether each name stays in the one-time 2026
                    wealth-tax base. Whether these cases establish a change
                    in CA domicile is contested; see the paper for details.
                  </p>
                  <div className="mt-4 space-y-4">
                    {[
                      {
                        key: "residency",
                        title: "Residency disputes",
                        items: RESIDENCY_ADJUSTMENTS.filter(
                          (adjustment) => adjustment.category === "residency"
                        ),
                      },
                      {
                        key: "pre_snapshot_departure",
                        title: "Announced departures",
                        items: RESIDENCY_ADJUSTMENTS.filter(
                          (adjustment) =>
                            adjustment.category === "pre_snapshot_departure"
                        ),
                      },
                    ].map((group) => (
                      <div key={group.key} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--gray-500)]">
                          {group.title}
                        </p>
                        <div className="space-y-2">
                          {group.items.map((adjustment) => {
                            const isExcluded =
                              params.residencyExclusionIds.includes(
                                adjustment.id
                              );
                            const isIncluded = !isExcluded;

                            return (
                              <div
                                key={adjustment.id}
                                className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                                  isExcluded
                                    ? "border-[var(--teal-600)] bg-[var(--teal-50)]"
                                    : "border-[var(--gray-200)] bg-white"
                                }`}
                              >
                                <div className="min-w-0 flex items-center gap-2">
                                  <span className="text-sm font-semibold text-[var(--gray-700)]">
                                    {adjustment.name}
                                  </span>
                                  <span
                                    title={adjustment.summary}
                                    className="inline-flex cursor-help text-[var(--gray-400)] hover:text-[var(--teal-600)]"
                                  >
                                    <InfoIcon className="h-4 w-4" />
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    toggleResidencyExclusion(adjustment.id)
                                  }
                                  aria-pressed={isIncluded}
                                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    isIncluded
                                      ? "border-[var(--teal-600)] bg-[var(--teal-700)] text-white"
                                      : "border-[var(--gray-300)] bg-white text-[var(--gray-600)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                                  }`}
                                >
                                  {isIncluded ? "Included" : "Excluded"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-[var(--gray-500)]">
                    Default includes all. Galle et al. argue none should be
                    excluded; Rauh &amp; Jaros exclude the full list. See the
                    paper for the legal and empirical arguments on each side.
                  </p>
                </details>

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
                          baseMicro.wealthTaxBaseRows.reduce(
                            (sum, row) => sum + row.excludedRealEstateB,
                            0
                          )
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
                />
                <p className="py-3 text-xs leading-5 text-[var(--gray-500)]">
                  This reduces one-time wealth-tax collections only. Any future
                  California income-tax effects are handled separately in stage
                  2 below.
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
                      />
                      <p className="text-xs leading-5 text-[var(--gray-500)]">
                        The checked announced departures already remove{" "}
                        <span className="font-semibold text-[var(--gray-700)]">
                          {formatPercent(observedDepartureLossShare, 1)}
                        </span>{" "}
                        of the residency-adjusted tax base. An overall elasticity of{" "}
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
                        label="Additional departure share of remaining base"
                        value={params.unannouncedDepartureShare}
                        onChange={(nextValue) =>
                          update("unannouncedDepartureShare", nextValue)
                        }
                        min={0}
                        max={1}
                        step={0.01}
                        format={(value) => formatPercent(value)}
                      />
                      <p className="text-xs leading-5 text-[var(--gray-500)]">
                        This is the additional loss applied after the checked
                        announced departures already remove{" "}
                        <span className="font-semibold text-[var(--gray-700)]">
                          {formatPercent(observedDepartureLossShare, 1)}
                        </span>{" "}
                        of the residency-adjusted tax base. On this snapshot,
                        Rauh&apos;s 12.6 literature-calibrated elasticity
                        corresponds to about{" "}
                        <span className="font-semibold text-[var(--gray-700)]">
                          {formatPercent(rauhLinearizedResidualShare, 1)}
                        </span>{" "}
                        of the remaining base under the paper&apos;s linear
                        conversion.
                      </p>
                    </>
                  )}
                  <p className="text-xs leading-5 text-[var(--gray-500)]">
                    These additional departures are treated as reducing the
                    one-time wealth-tax base. The current app does not yet
                    expose a separate control for later migration that would
                    affect PIT only.
                  </p>
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
                />
                <p className="py-3 text-xs leading-5 text-[var(--gray-500)]">
                  Nominal wealth growth converts to{" "}
                  <span className="font-semibold text-[var(--gray-700)]">
                    {formatPercent(realGrowthRate, 1)}
                  </span>{" "}
                  real growth after subtracting{" "}
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

              <AssumptionSection title="Stage 2: optional California income tax effects">
                <div className="space-y-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold tracking-[-0.01em] text-[var(--gray-700)]">
                      Include future CA income tax effects
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: false, label: "Off" },
                        { value: true, label: "On" },
                      ].map((option) => (
                        <button
                          key={String(option.value)}
                          type="button"
                          onClick={() =>
                            update("includeIncomeTaxEffects", option.value)
                          }
                          className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                            pitEffectsEnabled === option.value
                              ? "border-[var(--teal-600)] bg-[var(--teal-700)] text-white"
                              : "border-[var(--gray-300)] bg-white text-[var(--gray-700)] hover:border-[var(--teal-200)] hover:bg-[var(--teal-50)] hover:text-[var(--teal-700)]"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs leading-5 text-[var(--gray-500)]">
                    This second stage attributes some share of movers&apos;
                    future California PIT loss to the tax episode. It is a
                    separate causality assumption, not part of the one-time
                    wealth-tax score itself. Future PIT-only migration is not
                    yet modeled separately.
                  </p>
                </div>

                {pitEffectsEnabled ? (
                  <>
                  <Slider
                    label="Share of mover PIT loss attributed to the tax"
                    value={params.incomeTaxAttributionRate}
                    onChange={(nextValue) =>
                      update("incomeTaxAttributionRate", nextValue)
                    }
                    min={0}
                    max={1}
                    step={0.01}
                    format={(value) => formatPercent(value)}
                  />

                  <div className="rounded-2xl border border-[var(--gray-200)] bg-[var(--gray-50)] px-4 py-3 text-sm leading-6 text-[var(--gray-600)]">
                    Current mover PIT implied by the selected departure
                    assumptions:{" "}
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(micro.moverIncomeTaxB)}/yr
                    </span>
                    . Attributing{" "}
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatPercent(params.incomeTaxAttributionRate)}
                    </span>{" "}
                    of that to the tax yields{" "}
                    <span className="font-semibold text-[var(--gray-700)]">
                      {formatBillions(attributedMoverIncomeTaxB)}/yr
                    </span>{" "}
                    in modeled PIT loss before return and discounting.
                  </div>

                  {(micro.movers.length > 0 || modeledAdditionalDepartureShare > 0) && (
                    <>
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
                      />

                      <Slider
                        label="Annual CA-taxable income / taxed wealth"
                        value={params.incomeYieldRate}
                        onChange={(nextValue) =>
                          update("incomeYieldRate", nextValue)
                        }
                        min={0.005}
                        max={0.05}
                        step={0.001}
                        format={(value) => formatPercent(value, 1)}
                      />
                      {isRauhScenario && params.incomeYieldRate === 0.02 && (
                        <p className="rounded-2xl border border-[var(--teal-200)] bg-[var(--teal-50)] px-3 py-2 text-xs leading-5 text-[var(--teal-700)]">
                          The Rauh preset backs this{" "}
                          <span className="font-semibold">2.0%</span> value out
                          so PolicyEngine matches the paper&apos;s annual PIT
                          midpoint. Rauh et al. estimate PIT directly from FTB
                          data rather than from income divided by wealth.
                        </p>
                      )}

                      <Slider
                        label="Income tax horizon"
                        value={
                          params.horizonYears === Infinity
                            ? 100
                            : params.horizonYears
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
                      />

                      <Slider
                        label="Real discount rate"
                        value={params.discountRate}
                        onChange={(nextValue) =>
                          update("discountRate", nextValue)
                        }
                        min={0}
                        max={0.05}
                        step={0.005}
                        format={(value) => formatPercent(value, 1)}
                      />
                      <div className="py-3 text-sm text-[var(--gray-600)]">
                        {micro.knownDepartureRows.length > 0 && (
                          <span>
                            <span className="font-semibold text-[var(--gray-700)]">
                              {micro.preSnapshotDepartureRows.length}{" "}
                              announced departures
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
                          {formatBillions(result.annualIncomeTaxLost)}/yr
                        </span>{" "}
                        in attributed lost CA income tax.
                      </div>
                    </>
                  )}
                  </>
                ) : (
                  <p className="py-3 text-xs leading-5 text-[var(--gray-500)]">
                    With stage 2 off, the calculator reports only the one-time
                    wealth-tax score after the selected base, statutory,
                    erosion, and payment-timing assumptions.
                  </p>
                )}
              </AssumptionSection>
              </>
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
        </div>
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
