import { annotateBillionaires, buildResidencyRosterValuationRows } from "./microModel";
import { RESIDENCY_ROSTER_DATE } from "./residencyAdjustments";

/** Before January 1, a historical option describes its own population. */
export function selectSnapshotRows({ date, rows, valuations = null, residencyRows, metadata }) {
  const valuationRows = annotateBillionaires({ billionaires: rows, metadata, snapshotDate: date });
  if (date <= RESIDENCY_ROSTER_DATE) return valuationRows;
  return buildResidencyRosterValuationRows({
    residencyRows: annotateBillionaires({ billionaires: residencyRows, metadata, snapshotDate: RESIDENCY_ROSTER_DATE }),
    valuationRows,
    rosterValuations: valuations,
    includeNewEntrants: true,
  });
}

/** Load optional valuations only when present; other failures remain visible. */
export async function loadSnapshot({ date, loadJson }) {
  const [rows, valuations] = await Promise.all([
    loadJson(`snapshots/${date}.json`),
    loadJson(`roster_valuations/${date}.json`).catch((error) => {
      if (error.status === 404) return null;
      throw error;
    }),
  ]);
  return { date, rows, valuations };
}

/** The displayed date and both data files change in one successful transition. */
export function snapshotReducer(state, action) {
  if (action.type === "start") {
    return { ...state, requestedDate: action.date, status: "loading", errorDate: null };
  }
  if (action.type === "success" && action.snapshot.date === state.requestedDate) {
    return { ...state, ...action.snapshot, status: "ready", errorDate: null };
  }
  if (action.type === "failure" && action.date === state.requestedDate) {
    return { ...state, status: "error", errorDate: action.date };
  }
  return state;
}
