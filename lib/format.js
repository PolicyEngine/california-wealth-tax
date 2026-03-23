export function formatBillions(value, { showPlus = false, decimals = 1 } = {}) {
  const absoluteValue = Math.abs(value).toFixed(decimals);

  if (value < 0) {
    return `-$${absoluteValue}B`;
  }

  if (showPlus && value > 0) {
    return `+$${absoluteValue}B`;
  }

  return `$${absoluteValue}B`;
}
