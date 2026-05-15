// Securities use higher precision than money. Share quantities support
// 6 decimal places (fractional shares) and prices support 4 decimal
// places. Cost basis and market value are stored in the same integer
// minor units as transaction amounts (cents).

export const SHARES_SCALE = 1_000_000;
export const PRICE_SCALE = 10_000;

export function sharesToInteger(shares: number): number {
  return Math.round(shares * SHARES_SCALE);
}

export function integerToShares(shares: number): number {
  return shares / SHARES_SCALE;
}

export function priceToInteger(price: number): number {
  return Math.round(price * PRICE_SCALE);
}

export function integerToPrice(price: number): number {
  return price / PRICE_SCALE;
}

// Market value in integer minor units (cents), given share quantity and
// price in their respective scaled-integer representations.
export function holdingMarketValue(
  sharesInteger: number,
  priceInteger: number,
): number {
  return Math.round(
    integerToShares(sharesInteger) * integerToPrice(priceInteger) * 100,
  );
}

export function holdingGain(
  marketValue: number,
  costBasis: number,
): { gain: number; gainPercent: number | null } {
  const gain = marketValue - costBasis;
  return {
    gain,
    gainPercent: costBasis !== 0 ? gain / costBasis : null,
  };
}
