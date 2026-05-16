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

// A single buy/sell movement of a security. Shares and price are in
// their scaled-integer representations.
export type InvestmentTxnInput = {
  security: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
};

export type ComputedHolding = {
  security: string;
  shares: number;
  cost_basis: number;
};

// Derive current holdings (net shares and average-cost basis) from an
// ordered list of buy/sell transactions, the way Quicken builds
// holdings from the investment register. Transactions MUST be passed in
// chronological order (date ascending, then sort order). Securities
// whose net position is fully closed out are omitted.
export function computeHoldings(
  transactions: InvestmentTxnInput[],
): ComputedHolding[] {
  const positions = new Map<string, { shares: number; cost_basis: number }>();

  for (const txn of transactions) {
    const position = positions.get(txn.security) ?? {
      shares: 0,
      cost_basis: 0,
    };

    if (txn.type === 'buy') {
      position.shares += txn.shares;
      position.cost_basis += holdingMarketValue(txn.shares, txn.price);
    } else {
      // Average-cost method: a sale removes cost basis proportional to
      // the fraction of shares sold.
      if (position.shares > 0) {
        const fraction = txn.shares / position.shares;
        position.cost_basis -= Math.round(position.cost_basis * fraction);
      }
      position.shares -= txn.shares;

      if (position.shares <= 0) {
        position.shares = 0;
        position.cost_basis = 0;
      }
    }

    positions.set(txn.security, position);
  }

  return [...positions.entries()]
    .filter(([, position]) => position.shares !== 0)
    .map(([security, position]) => ({
      security,
      shares: position.shares,
      cost_basis: position.cost_basis,
    }));
}
