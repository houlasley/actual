import type { AccountEntity } from './account';
import type { SecurityEntity } from './security';

export type InvestmentTransactionType = 'buy' | 'sell';

export type InvestmentTransactionEntity = {
  id: string;
  account: AccountEntity['id'];
  security: SecurityEntity['id'];
  date: string;
  type: InvestmentTransactionType;
  // Scaled integer (see SHARES_SCALE in #shared/securities).
  shares: number;
  // Per-share price as a scaled integer (see PRICE_SCALE).
  price: number;
};
