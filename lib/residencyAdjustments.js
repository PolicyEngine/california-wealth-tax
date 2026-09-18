export const RESIDENCY_ROSTER_DATE = "2026-01-01";

const FORTUNE_SIX_URL =
  "https://fortune.com/2026/03/17/6-billionaires-left-california-billionaire-tax-newsom-brin-page-thiel-spielberg-revenue/";
const RAUH_PAPER_URL =
  "https://www.hoover.org/research/net-present-value-billionaire-tax-act-assessment-fiscal-effects-californias-proposed";

// Documented claims that a person on Forbes' January 1, 2026 California list
// was not a California resident on that date. The default base keeps all of
// them: California domicile turns on a closest-connection test, and none of
// these claims has been tested. Each is a user choice with its evidence shown.
// Larry Ellison is handled in data/billionaire_metadata.json instead: Forbes
// lists him in Florida and every published estimate now excludes him.
export const RESIDENCY_ADJUSTMENTS = [
  {
    id: "houston",
    name: "Drew Houston",
    category: "residency",
    summary:
      "Rauh et al. classify him as a non-resident. Forbes lists San Francisco as of September 2026.",
    sourceUrl: RAUH_PAPER_URL,
  },
  {
    id: "snyder",
    name: "Lynsi Snyder",
    category: "residency",
    summary:
      "Rauh et al. classify her as a non-resident. Forbes now lists Franklin, Tennessee.",
    sourceUrl: RAUH_PAPER_URL,
  },
  {
    id: "page",
    name: "Larry Page",
    category: "pre_snapshot_departure",
    summary:
      "Fortune (March 17, 2026) lists him among six who took steps to leave before January 1. Forbes still lists Palo Alto.",
    sourceUrl: FORTUNE_SIX_URL,
  },
  {
    id: "brin",
    name: "Sergey Brin",
    category: "pre_snapshot_departure",
    summary:
      "Among Fortune's six; NPR (August 22, 2026) reports a move to the Nevada side of Lake Tahoe. Forbes still lists Los Altos.",
    sourceUrl: "https://text.npr.org/nx-s1-5935597",
  },
  {
    id: "thiel",
    name: "Peter Thiel",
    category: "pre_snapshot_departure",
    summary:
      "Among Fortune's six. Forbes moved him off its California list on September 3, 2026.",
    sourceUrl: FORTUNE_SIX_URL,
  },
  {
    id: "kalanick",
    name: "Travis Kalanick",
    category: "pre_snapshot_departure",
    summary:
      "Said on the record that he moved to Texas on December 18, 2025. Forbes now lists Austin.",
    sourceUrl:
      "https://www.foxbusiness.com/real-estate/billionaire-uber-co-founder-travis-kalanick-admits-strategically-moving-texas-before-california-wealth-tax",
  },
  {
    id: "hankey",
    name: "Don Hankey",
    category: "pre_snapshot_departure",
    summary: "Among Fortune's six. Forbes now lists Las Vegas.",
    sourceUrl: FORTUNE_SIX_URL,
  },
  {
    id: "spielberg",
    name: "Steven Spielberg",
    category: "pre_snapshot_departure",
    summary:
      "Fortune, citing the Los Angeles Times: became a New York City resident on January 1, 2026. Forbes moved him off its California list on September 3, 2026.",
    sourceUrl: FORTUNE_SIX_URL,
  },
];

const ADJUSTMENT_BY_ID = new Map(
  RESIDENCY_ADJUSTMENTS.map((adjustment) => [adjustment.id, adjustment])
);

export const RESIDENCY_ONLY_EXCLUSION_IDS = RESIDENCY_ADJUSTMENTS
  .filter((adjustment) => adjustment.category === "residency")
  .map((adjustment) => adjustment.id);

export const PRE_SNAPSHOT_EXCLUSION_IDS = RESIDENCY_ADJUSTMENTS
  .filter((adjustment) => adjustment.category === "pre_snapshot_departure")
  .map((adjustment) => adjustment.id);

// The pre-January-1 departures Rauh et al. list in their Table 6 (five of the
// six; David Sacks is not on the Forbes list). Travis Kalanick's move is on
// the record but is not in their paper, so their assumption set and links
// written when it defined "after pre-snapshot departures" leave him in.
export const RAUH_PRE_SNAPSHOT_EXCLUSION_IDS = PRE_SNAPSHOT_EXCLUSION_IDS.filter(
  (id) => id !== "kalanick"
);

export function normalizeResidencyExclusionIds(ids = []) {
  const seen = new Set();

  return RESIDENCY_ADJUSTMENTS.map((adjustment) => adjustment.id).filter((id) => {
    if (!ids.includes(id) || seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
}

export function residencyExcludedNamesFromIds(ids = []) {
  return normalizeResidencyExclusionIds(ids)
    .map((id) => ADJUSTMENT_BY_ID.get(id)?.name)
    .filter(Boolean);
}
