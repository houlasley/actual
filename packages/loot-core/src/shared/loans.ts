// Amortization math for loan/debt tracking.
//
// All monetary amounts use the same integer minor-unit representation as
// transactions (e.g. cents for USD). Rates are stored as basis points
// (1 bp = 0.01%), so 375 = 3.75% APR.

export const RATE_SCALE = 10_000; // 1 basis point = 1 / RATE_SCALE

/**
 * Convert basis-point integer to a monthly decimal rate.
 * e.g. 375 bp (3.75% APR) → 0.003125 monthly rate
 */
export function bpsToMonthlyRate(annualRateBps: number): number {
  return annualRateBps / RATE_SCALE / 12;
}

/**
 * Compute the fixed monthly payment (principal + interest, excluding escrow)
 * using the standard amortization formula.
 *
 * Returns an integer in minor units, rounded up to the nearest cent to ensure
 * the loan is paid off within `termMonths`.
 *
 * If the rate is 0 the payment is simply principal / termMonths.
 */
export function computeMonthlyPayment(
  principalMinorUnits: number,
  annualRateBps: number,
  termMonths: number,
): number {
  if (termMonths <= 0) return 0;
  if (annualRateBps === 0) {
    return Math.ceil(principalMinorUnits / termMonths);
  }

  const r = bpsToMonthlyRate(annualRateBps);
  const factor = Math.pow(1 + r, termMonths);
  // M = P * r * (1+r)^n / ((1+r)^n - 1)
  const payment = (principalMinorUnits * r * factor) / (factor - 1);
  return Math.ceil(payment);
}

export type AmortizationPeriod = {
  /** 1-based payment number. */
  period: number;
  /** ISO date (YYYY-MM-DD) of the payment due date. */
  date: string;
  /** Opening balance for this period in minor units. */
  opening_balance: number;
  /** Interest charged this period in minor units. */
  interest: number;
  /** Principal repaid this period in minor units. */
  principal: number;
  /** Scheduled P+I payment in minor units. */
  payment: number;
  /** Closing balance after this period in minor units. */
  closing_balance: number;
};

export type LoanAmortizationInput = {
  original_principal: number;
  interest_rate: number;
  term_months: number;
  /** ISO date string (YYYY-MM-DD) of the first payment date. */
  origination_date: string;
  payment_amount: number;
};

/**
 * Generate the full amortization schedule for a loan.
 *
 * The final period may have a smaller payment to retire the remaining balance
 * exactly (avoids over/underpayment due to rounding).
 */
export function generateAmortizationSchedule(
  loan: LoanAmortizationInput,
): AmortizationPeriod[] {
  const schedule: AmortizationPeriod[] = [];
  let balance = loan.original_principal;
  const r = bpsToMonthlyRate(loan.interest_rate);

  const [baseYear, baseMonth, baseDay] = loan.origination_date
    .split('-')
    .map(Number);

  for (let period = 1; period <= loan.term_months; period++) {
    if (balance <= 0) break;

    const interest =
      loan.interest_rate === 0 ? 0 : Math.round(balance * r);
    let principal = loan.payment_amount - interest;

    // Final payment: retire whatever is left
    if (principal >= balance || period === loan.term_months) {
      principal = balance;
    }

    const payment = interest + principal;
    const closingBalance = balance - principal;

    // Advance by (period - 1) months from the origination month,
    // keeping the same day-of-month.
    const totalMonths = baseMonth - 1 + (period - 1);
    const year = baseYear + Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(baseDay).padStart(2, '0')}`;

    schedule.push({
      period,
      date: dateStr,
      opening_balance: balance,
      interest,
      principal,
      payment,
      closing_balance: closingBalance,
    });

    balance = closingBalance;
  }

  return schedule;
}

export type PaymentRecord = {
  /** ISO date of the actual payment. */
  date: string;
  /** Total amount paid (P+I only, excluding escrow) in minor units. */
  amount: number;
  /** Interest portion of this payment in minor units. */
  interest: number;
};

/**
 * Compute the remaining principal balance given actual payment history.
 *
 * Walks through the amortization schedule and subtracts actual principal
 * payments. Extra principal payments reduce the balance immediately.
 *
 * Payments are matched by period order (not by date), which keeps the
 * calculation simple and predictable.
 */
export function computeRemainingBalance(
  loan: LoanAmortizationInput,
  payments: PaymentRecord[],
): number {
  let balance = loan.original_principal;
  const r = bpsToMonthlyRate(loan.interest_rate);

  for (const payment of payments) {
    if (balance <= 0) break;
    const interest =
      loan.interest_rate === 0 ? 0 : Math.round(balance * r);
    const principalPaid = payment.amount - interest;
    balance = Math.max(0, balance - principalPaid);
  }

  return balance;
}

/**
 * Project the payoff date given actual payment history.
 *
 * Starting from the current remaining balance, simulate future scheduled
 * payments (at `loan.payment_amount`) to determine when the balance hits 0.
 *
 * Returns an ISO date string (YYYY-MM-DD), or null if the loan is already
 * paid off.
 */
export function computeProjectedPayoffDate(
  loan: LoanAmortizationInput,
  payments: PaymentRecord[],
): string | null {
  const remainingBalance = computeRemainingBalance(loan, payments);
  if (remainingBalance <= 0) return null;

  const r = bpsToMonthlyRate(loan.interest_rate);
  let balance = remainingBalance;

  // Start projecting from the period after the last actual payment
  const startPeriod = payments.length;
  const [baseYear, baseMonth, baseDay] = loan.origination_date
    .split('-')
    .map(Number);

  function periodToDate(periodIndex: number): string {
    const totalMonths = baseMonth - 1 + periodIndex;
    const year = baseYear + Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(baseDay).padStart(2, '0')}`;
  }

  for (let i = 0; i < loan.term_months; i++) {
    if (balance <= 0) break;

    const interest =
      loan.interest_rate === 0 ? 0 : Math.round(balance * r);
    const principal = Math.min(loan.payment_amount - interest, balance);
    balance -= principal;

    if (balance <= 0) {
      return periodToDate(startPeriod + i);
    }
  }

  // Fallback: last period of the original schedule
  return periodToDate(loan.term_months - 1);
}

/**
 * Split a single loan payment into its interest and principal components,
 * given the current outstanding balance.
 *
 * Useful for automatically categorizing a payment transaction.
 */
export function splitPayment(
  totalPaymentMinorUnits: number,
  currentBalanceMinorUnits: number,
  annualRateBps: number,
): { interest: number; principal: number } {
  const r = bpsToMonthlyRate(annualRateBps);
  const interest =
    annualRateBps === 0 ? 0 : Math.round(currentBalanceMinorUnits * r);
  const principal = Math.max(0, totalPaymentMinorUnits - interest);
  return { interest, principal };
}
