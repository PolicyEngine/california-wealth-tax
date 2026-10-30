export function formatBillions(value, { showPlus = false, decimals = 1 } = {}) {
  if (!Number.isFinite(value)) {
    return value === Infinity ? "+∞" : value === -Infinity ? "-∞" : "—";
  }

  const absoluteValue = Math.abs(value).toFixed(decimals);

  if (value < 0) {
    return `-$${absoluteValue}B`;
  }

  if (showPlus && value > 0) {
    return `+$${absoluteValue}B`;
  }

  return `$${absoluteValue}B`;
}

export function longDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const monthName = new Date(Date.UTC(year, month - 1, day)).toLocaleString(
    "en-US",
    { month: "long", timeZone: "UTC" }
  );
  return `${monthName} ${day}, ${year}`;
}
