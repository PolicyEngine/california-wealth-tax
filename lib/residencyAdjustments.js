export const RESIDENCY_ROSTER_DATE = "2026-01-01";

export const RESIDENCY_ADJUSTMENTS = [
  {
    id: "ellison",
    name: "Larry Ellison",
    category: "residency",
    summary:
      "Public reporting says he moved to Hawaii in 2020; Berkeley materials still appear to include him.",
  },
  {
    id: "houston",
    name: "Drew Houston",
    category: "residency",
    summary:
      "Rauh/Jaros treat him as no longer a California resident by January 1, 2026.",
  },
  {
    id: "snyder",
    name: "Lynsi Snyder",
    category: "residency",
    summary:
      "Rauh/Jaros treat her as no longer a California resident by January 1, 2026.",
  },
  {
    id: "page",
    name: "Larry Page",
    category: "pre_snapshot_departure",
    summary:
      "Rauh/Jaros treat him as a publicly reported pre-January 1, 2026 departure.",
  },
  {
    id: "brin",
    name: "Sergey Brin",
    category: "pre_snapshot_departure",
    summary:
      "Rauh/Jaros treat him as a publicly reported pre-January 1, 2026 departure.",
  },
  {
    id: "thiel",
    name: "Peter Thiel",
    category: "pre_snapshot_departure",
    summary:
      "Rauh/Jaros treat him as a publicly reported pre-January 1, 2026 departure.",
  },
  {
    id: "hankey",
    name: "Don Hankey",
    category: "pre_snapshot_departure",
    summary:
      "Rauh/Jaros treat him as a publicly reported pre-January 1, 2026 departure.",
  },
  {
    id: "spielberg",
    name: "Steven Spielberg",
    category: "pre_snapshot_departure",
    summary:
      "Rauh/Jaros treat him as a publicly reported pre-January 1, 2026 departure.",
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
