export function buildWaterfallData(waterfall, { totalLabel = "Net impact" } = {}) {
  let running = 0;

  const data = waterfall
    .filter((step) => Math.abs(step.value) > 1e-9)
    .map((step) => {
      const start = running;
      const end = running + step.value;

      running = end;

      return {
        id: step.id ?? step.label,
        label: step.label,
        value: step.value,
        base: Math.min(start, end),
        height: Math.abs(end - start),
        total: end,
        isNegative: end < start,
      };
    });

  data.push({
    id: "total",
    label: totalLabel,
    value: running,
    base: Math.min(0, running),
    height: Math.abs(running),
    total: running,
    isNegative: running < 0,
    isTotal: true,
  });

  return data;
}
