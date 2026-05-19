import type { AccountEntity } from './account';

export type LoanProfileEntity = {
  id: string;
  account: AccountEntity['id'];
  /** Loan principal at origination, in integer minor units (e.g. cents). */
  original_principal: number;
  /**
   * Annual interest rate in basis points (e.g. 375 = 3.75% APR).
   * Stored as an integer to avoid floating-point drift.
   */
  interest_rate: number;
  /** Loan term in months. */
  term_months: number;
  /** ISO date string (YYYY-MM-DD) of the first payment / origination. */
  origination_date: string;
  /** Scheduled monthly payment in integer minor units. */
  payment_amount: number;
  /** Monthly escrow (taxes/insurance) in integer minor units; 0 if none. */
  escrow_amount: number;
};
