/** Four corners suffice for finite bilinear scores. Divergent streams need
 * direct evaluation: zero times Infinity would otherwise spoil finite edges. */
export function bilinearGrid(evaluate, xs, ys) {
  const [x0, x1] = [xs[0], xs.at(-1)];
  const [y0, y1] = [ys[0], ys.at(-1)];
  const [f00, f10, f01, f11] = [evaluate(x0, y0), evaluate(x1, y0), evaluate(x0, y1), evaluate(x1, y1)];
  if (![f00, f10, f01, f11].every(Number.isFinite) || x0 === x1 || y0 === y1) return evaluate;
  return (x, y) => {
    const u = (x - x0) / (x1 - x0);
    const v = (y - y0) / (y1 - y0);
    return f00 * (1 - u) * (1 - v) + f10 * u * (1 - v) + f01 * (1 - u) * v + f11 * u * v;
  };
}

/**
 * The heatmap's net present value over the unannounced share (x) and the
 * cohort's income tax (y), exact from corners.
 *
 * Without a total income-tax departure share the score is bilinear. With one,
 * f, the income tax lost is max(L0, f × T): what documented and modeled
 * departures take (L0) or f of the cohort total (T), whichever is larger. Both
 * L0 and T are bilinear, and the present value of a loss is linear in it, so
 *
 *   NPV_f = min(NPV_0, f × NPV_1 + (1 − f) × PV receipts),
 *
 * since at f = 1 the whole cohort total is lost. Three bilinear surfaces, four
 * corners each. `scoreCell(x, y, targetShare)` returns the scenario's
 * `{ npv, pvReceipts }`; divergent corners fall back to direct evaluation.
 */
export function heatmapEvaluator(scoreCell, xs, ys, targetShare = 0) {
  const npvAt = (share) => bilinearGrid((x, y) => scoreCell(x, y, share).npv, xs, ys);

  if (!(targetShare > 0)) {
    return npvAt(0);
  }

  const npv0 = npvAt(0);
  const npv1 = npvAt(1);
  const receipts = bilinearGrid((x, y) => scoreCell(x, y, 0).pvReceipts, xs, ys);

  return (x, y) =>
    Math.min(npv0(x, y), targetShare * npv1(x, y) + (1 - targetShare) * receipts(x, y));
}

/**
 * Why the two heatmaps (income tax divided by wealth, or by filings for the
 * four largest) agree or differ. They differ only through named movers, whom
 * the divisions assign different amounts; a total departure share sets the
 * loss to f of the cohort total wherever it binds, the same under either.
 */
export function heatmapCaption({
  coincide,
  departureClaimApplied,
  targetShare = 0,
  // Whether any cell short of a 100% unannounced share agrees: where the
  // total share binds. At a low target it binds nowhere.
  agreesWhereTargetBinds = false,
}) {
  const share = targetShare > 0 ? `${Math.round(targetShare * 100)}%` : null;

  if (coincide) {
    if (!departureClaimApplied) {
      return " The two grids coincide right now: with no documented departure applied, the unannounced share takes the same slice of everyone's income tax under either division. Apply a departure claim in the residency panel and the grids separate.";
    }
    return share
      ? ` The two grids coincide right now: the total departure share of ${share} sets the income tax lost in every cell, whichever way it is divided.`
      : " The two grids coincide right now.";
  }

  return (
    " The grids differ because the departure claims applied in the residency panel name specific people, and the two divisions assign them different amounts." +
    (share && agreesWhereTargetBinds
      ? ` Where the total departure share of ${share} sets the loss, at low unannounced shares, the division does not matter and the grids agree.`
      : "")
  );
}
