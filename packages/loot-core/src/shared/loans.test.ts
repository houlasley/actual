import { describe, expect, it } from 'vitest';

import {
  bpsToMonthlyRate,
  computeMonthlyPayment,
  computeProjectedPayoffDate,
  computeRemainingBalance,
  generateAmortizationSchedule,
  splitPayment,
  type LoanAmortizationInput,
} from './loans';

describe('bpsToMonthlyRate', () => {
  it('converts 375 bps (3.75% APR) to monthly rate', () => {
    expect(bpsToMonthlyRate(375)).toBeCloseTo(0.003125, 8);
  });

  it('returns 0 for 0 bps', () => {
    expect(bpsToMonthlyRate(0)).toBe(0);
  });

  it('converts 600 bps (6.00% APR) to monthly rate', () => {
    expect(bpsToMonthlyRate(600)).toBeCloseTo(0.005, 8);
  });
});

describe('computeMonthlyPayment', () => {
  it('computes the correct payment for a 30-year mortgage at 6%', () => {
    // $200,000 loan, 6% APR, 360 months → ~$1,199.10/mo
    const payment = computeMonthlyPayment(20_000_000, 600, 360);
    // Allow ±1 cent because we round up
    expect(payment).toBeGreaterThanOrEqual(119_910);
    expect(payment).toBeLessThanOrEqual(119_911);
  });

  it('computes zero-rate loan (equal installments)', () => {
    // $12,000 loan, 0% APR, 12 months → $1,000/mo
    const payment = computeMonthlyPayment(1_200_000, 0, 12);
    expect(payment).toBe(100_000);
  });

  it('rounds up to ensure full payoff', () => {
    // $1,000 at 0% over 3 months → ceil(1000/3) = 334
    const payment = computeMonthlyPayment(1000, 0, 3);
    expect(payment).toBe(334);
  });

  it('returns 0 for term of 0', () => {
    expect(computeMonthlyPayment(100_000, 500, 0)).toBe(0);
  });
});

describe('generateAmortizationSchedule', () => {
  const shortLoan: LoanAmortizationInput = {
    original_principal: 1_200_000, // $12,000
    interest_rate: 0,
    term_months: 12,
    origination_date: '2024-01-01',
    payment_amount: 100_000, // $1,000/mo
  };

  it('generates one entry per month for the term', () => {
    const schedule = generateAmortizationSchedule(shortLoan);
    expect(schedule).toHaveLength(12);
  });

  it('first period opens at original principal', () => {
    const schedule = generateAmortizationSchedule(shortLoan);
    expect(schedule[0].opening_balance).toBe(1_200_000);
  });

  it('final period closes at zero balance', () => {
    const schedule = generateAmortizationSchedule(shortLoan);
    expect(schedule[schedule.length - 1].closing_balance).toBe(0);
  });

  it('period numbers are 1-based and sequential', () => {
    const schedule = generateAmortizationSchedule(shortLoan);
    schedule.forEach((p, i) => expect(p.period).toBe(i + 1));
  });

  it('dates advance by one month each period', () => {
    const schedule = generateAmortizationSchedule(shortLoan);
    expect(schedule[0].date).toBe('2024-01-01');
    expect(schedule[1].date).toBe('2024-02-01');
    expect(schedule[11].date).toBe('2024-12-01');
  });

  it('computes correct interest and principal for an interest-bearing loan', () => {
    // $10,000 at 6% APR, 12 months
    const loan: LoanAmortizationInput = {
      original_principal: 1_000_000,
      interest_rate: 600,
      term_months: 12,
      origination_date: '2024-01-01',
      payment_amount: computeMonthlyPayment(1_000_000, 600, 12),
    };
    const schedule = generateAmortizationSchedule(loan);

    // Period 1: interest = round(1,000,000 * 0.005) = 5,000
    expect(schedule[0].interest).toBe(5_000);
    // closing_balance < opening_balance
    expect(schedule[0].closing_balance).toBeLessThan(schedule[0].opening_balance);
    // Final balance is 0
    expect(schedule[schedule.length - 1].closing_balance).toBe(0);
  });

  it('total interest paid is positive for an interest-bearing loan', () => {
    const loan: LoanAmortizationInput = {
      original_principal: 1_000_000,
      interest_rate: 600,
      term_months: 12,
      origination_date: '2024-01-01',
      payment_amount: computeMonthlyPayment(1_000_000, 600, 12),
    };
    const schedule = generateAmortizationSchedule(loan);
    const totalInterest = schedule.reduce((acc, p) => acc + p.interest, 0);
    expect(totalInterest).toBeGreaterThan(0);
  });

  it('stops early if balance reaches 0', () => {
    // Overpay: $1,200 payment on $1,200 balance → done in 1 period
    const loan: LoanAmortizationInput = {
      original_principal: 100_000,
      interest_rate: 0,
      term_months: 12,
      origination_date: '2024-01-01',
      payment_amount: 100_000,
    };
    const schedule = generateAmortizationSchedule(loan);
    expect(schedule).toHaveLength(1);
  });
});

describe('computeRemainingBalance', () => {
  const loan: LoanAmortizationInput = {
    original_principal: 1_200_000,
    interest_rate: 0,
    term_months: 12,
    origination_date: '2024-01-01',
    payment_amount: 100_000,
  };

  it('returns original principal with no payments', () => {
    expect(computeRemainingBalance(loan, [])).toBe(1_200_000);
  });

  it('reduces balance after each payment', () => {
    const after1 = computeRemainingBalance(loan, [
      { date: '2024-01-01', amount: 100_000, interest: 0 },
    ]);
    expect(after1).toBe(1_100_000);
  });

  it('returns 0 after all payments', () => {
    const payments = Array.from({ length: 12 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, '0')}-01`,
      amount: 100_000,
      interest: 0,
    }));
    expect(computeRemainingBalance(loan, payments)).toBe(0);
  });

  it('reflects extra principal payments', () => {
    // Two payments of $200 instead of $100 → balance reduced by $400
    const payments = [
      { date: '2024-01-01', amount: 200_000, interest: 0 },
      { date: '2024-02-01', amount: 200_000, interest: 0 },
    ];
    expect(computeRemainingBalance(loan, payments)).toBe(800_000);
  });
});

describe('computeProjectedPayoffDate', () => {
  const loan: LoanAmortizationInput = {
    original_principal: 1_200_000,
    interest_rate: 0,
    term_months: 12,
    origination_date: '2024-01-01',
    payment_amount: 100_000,
  };

  it('projects payoff at month 12 with no extra payments', () => {
    const date = computeProjectedPayoffDate(loan, []);
    // 12 months from Jan 2024 → month 11 index → Dec 2024
    expect(date).toBe('2024-12-01');
  });

  it('returns null for an already paid-off loan', () => {
    const payments = Array.from({ length: 12 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, '0')}-01`,
      amount: 100_000,
      interest: 0,
    }));
    expect(computeProjectedPayoffDate(loan, payments)).toBeNull();
  });

  it('projects an earlier payoff date when extra payments are made', () => {
    // Pay double for 6 months → should be done
    const payments = Array.from({ length: 6 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, '0')}-01`,
      amount: 200_000,
      interest: 0,
    }));
    const date = computeProjectedPayoffDate(loan, payments);
    // After 6 double payments the balance is 0, so null
    expect(date).toBeNull();
  });
});

describe('splitPayment', () => {
  it('splits a payment into interest and principal at 6% APR', () => {
    // $100,000 balance, 6% APR → monthly interest = $500
    const { interest, principal } = splitPayment(120_000, 10_000_000, 600);
    expect(interest).toBe(50_000); // 10,000,000 * 0.005
    expect(principal).toBe(70_000); // 120,000 - 50,000
  });

  it('allocates 100% to principal when rate is 0', () => {
    const { interest, principal } = splitPayment(100_000, 5_000_000, 0);
    expect(interest).toBe(0);
    expect(principal).toBe(100_000);
  });

  it('does not produce negative principal', () => {
    // If payment is smaller than interest, principal floors at 0
    const { principal } = splitPayment(100, 100_000_000, 600);
    expect(principal).toBeGreaterThanOrEqual(0);
  });
});
