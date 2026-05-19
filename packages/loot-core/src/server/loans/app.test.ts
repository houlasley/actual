// @ts-strict-ignore
import * as db from '#server/db';

import { app } from './app';

beforeEach(global.emptyDatabase());

const getLoanProfile = app.handlers['loan-profile-get'];
const setLoanProfile = app.handlers['loan-profile-set'];
const deleteLoanProfile = app.handlers['loan-profile-delete'];
const getAmortizationSchedule = app.handlers['loan-amortization-schedule'];
const getRemainingBalance = app.handlers['loan-remaining-balance'];
const getProjectedPayoffDate = app.handlers['loan-projected-payoff'];
const computePaymentAmount = app.handlers['loan-compute-payment'];
const splitLoanPayment = app.handlers['loan-split-payment'];

const ACCOUNT_ID = 'test-acct-1';

async function insertTestAccount() {
  await db.insertAccount({ id: ACCOUNT_ID, name: 'Mortgage' });
}

const BASE_PROFILE = {
  account: ACCOUNT_ID,
  original_principal: 1_200_000, // $12,000
  interest_rate: 0,
  term_months: 12,
  origination_date: '2024-01-01',
  payment_amount: 100_000,
  escrow_amount: 0,
};

describe('Loan profiles', () => {
  it('returns null when no profile exists', async () => {
    await insertTestAccount();
    const profile = await getLoanProfile({ accountId: ACCOUNT_ID });
    expect(profile).toBeNull();
  });

  it('creates and retrieves a loan profile', async () => {
    await insertTestAccount();
    await setLoanProfile(BASE_PROFILE);

    const profile = await getLoanProfile({ accountId: ACCOUNT_ID });
    expect(profile).toMatchObject({
      account: ACCOUNT_ID,
      original_principal: 1_200_000,
      interest_rate: 0,
      term_months: 12,
      origination_date: '2024-01-01',
      payment_amount: 100_000,
      escrow_amount: 0,
    });
    expect(profile!.id).toBeTruthy();
  });

  it('updates an existing profile when set again', async () => {
    await insertTestAccount();
    const first = await setLoanProfile(BASE_PROFILE);
    const second = await setLoanProfile({
      ...BASE_PROFILE,
      interest_rate: 375,
      payment_amount: 102_000,
    });

    expect(second.id).toBe(first.id);
    const profile = await getLoanProfile({ accountId: ACCOUNT_ID });
    expect(profile!.interest_rate).toBe(375);
    expect(profile!.payment_amount).toBe(102_000);
  });

  it('deletes a profile', async () => {
    await insertTestAccount();
    await setLoanProfile(BASE_PROFILE);
    await deleteLoanProfile({ accountId: ACCOUNT_ID });

    const profile = await getLoanProfile({ accountId: ACCOUNT_ID });
    expect(profile).toBeNull();
  });

  it('deleting a non-existent profile does nothing', async () => {
    await insertTestAccount();
    await expect(
      deleteLoanProfile({ accountId: ACCOUNT_ID }),
    ).resolves.toBeUndefined();
  });
});

describe('Amortization schedule (via server)', () => {
  it('generates a schedule for a zero-rate loan', async () => {
    await insertTestAccount();
    await setLoanProfile(BASE_PROFILE);

    const schedule = await getAmortizationSchedule({ accountId: ACCOUNT_ID });
    expect(schedule).toHaveLength(12);
    expect(schedule[0].opening_balance).toBe(1_200_000);
    expect(schedule[11].closing_balance).toBe(0);
  });

  it('throws when no profile exists', async () => {
    await insertTestAccount();
    await expect(
      getAmortizationSchedule({ accountId: ACCOUNT_ID }),
    ).rejects.toThrow(/No loan profile/);
  });
});

describe('Remaining balance (via server)', () => {
  it('returns original principal with no payments', async () => {
    await insertTestAccount();
    await setLoanProfile(BASE_PROFILE);

    const balance = await getRemainingBalance({
      accountId: ACCOUNT_ID,
      payments: [],
    });
    expect(balance).toBe(1_200_000);
  });

  it('reduces balance after payments', async () => {
    await insertTestAccount();
    await setLoanProfile(BASE_PROFILE);

    const balance = await getRemainingBalance({
      accountId: ACCOUNT_ID,
      payments: [
        { date: '2024-01-01', amount: 100_000, interest: 0 },
        { date: '2024-02-01', amount: 100_000, interest: 0 },
      ],
    });
    expect(balance).toBe(1_000_000);
  });
});

describe('Projected payoff date (via server)', () => {
  it('projects payoff at month 12 with no extra payments', async () => {
    await insertTestAccount();
    await setLoanProfile(BASE_PROFILE);

    const date = await getProjectedPayoffDate({
      accountId: ACCOUNT_ID,
      payments: [],
    });
    expect(date).toBe('2024-12-01');
  });

  it('returns null for a fully paid loan', async () => {
    await insertTestAccount();
    await setLoanProfile(BASE_PROFILE);

    const payments = Array.from({ length: 12 }, (_, i) => ({
      date: `2024-${String(i + 1).padStart(2, '0')}-01`,
      amount: 100_000,
      interest: 0,
    }));

    const date = await getProjectedPayoffDate({
      accountId: ACCOUNT_ID,
      payments,
    });
    expect(date).toBeNull();
  });
});

describe('Utility handlers', () => {
  it('computes a monthly payment amount', async () => {
    // $12,000 at 0% for 12 months → $1,000
    const payment = await computePaymentAmount({
      principal: 1_200_000,
      annualRateBps: 0,
      termMonths: 12,
    });
    expect(payment).toBe(100_000);
  });

  it('splits a payment into interest and principal', async () => {
    const { interest, principal } = await splitLoanPayment({
      totalPayment: 120_000,
      currentBalance: 10_000_000,
      annualRateBps: 600,
    });
    // 10,000,000 * 0.005 = 50,000 interest
    expect(interest).toBe(50_000);
    expect(principal).toBe(70_000);
  });
});
