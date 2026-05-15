import type { AccountEntity } from './account';
import type { SecurityEntity } from './security';

export type HoldingEntity = {
  id: string;
  account: AccountEntity['id'];
  security: SecurityEntity['id'];
  shares: number;
  cost_basis: number;
};
