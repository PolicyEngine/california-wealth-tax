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

/** The heatmap scores are bilinear in the unannounced share and the cohort
 * total unless a total income-tax departure share is set: the later
 * departures it adds fill the gap up to the target, a kink no four corners can
 * capture. Those grids are evaluated cell by cell. */
export function scoresAreBilinear(assumptions) {
  return !((assumptions.incomeTaxDepartureShare ?? 0) > 0);
}
