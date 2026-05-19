import { createApp } from '#server/app';
import * as db from '#server/db';
import type { DbLoanProfile } from '#server/db';
import { mutator } from '#server/mutators';
import { undoable } from '#server/undo';
import {
  computeMonthlyPayment,
  computeProjectedPayoffDate,
  computeRemainingBalance,
  generateAmortizationSchedule,
  splitPayment,
  type AmortizationPeriod,
  type LoanAmortizationInput,
  type PaymentRecord,
} from '#shared/loans';
import type { LoanProfileEntity } from '#types/models';

export type LoansHandlers = {
  'loan-profile-get': typeof getLoanProfile;
  'loan-profile-set': typeof setLoanProfile;
  'loan-profile-delete': typeof deleteLoanProfile;
  'loan-amortization-schedule': typeof getAmortizationSchedule;
  'loan-remaining-balance': typeof getRemainingBalance;
  'loan-projected-payoff': typeof getProjectedPayoffDate;
  'loan-compute-payment': typeof computePaymentAmount;
  'loan-split-payment': typeof splitLoanPayment;
};

export const app = createApp<LoansHandlers>();
app.method('loan-profile-get', getLoanProfile);
app.method('loan-profile-set', mutator(undoable(setLoanProfile)));
app.method('loan-profile-delete', mutator(undoable(deleteLoanProfile)));
app.method('loan-amortization-schedule', getAmortizationSchedule);
app.method('loan-remaining-balance', getRemainingBalance);
app.method('loan-projected-payoff', getProjectedPayoffDate);
app.method('loan-compute-payment', computePaymentAmount);
app.method('loan-split-payment', splitLoanPayment);

async function getLoanProfile({
  accountId,
}: {
  accountId: LoanProfileEntity['account'];
}): Promise<LoanProfileEntity | null> {
  const row = await db.getLoanProfile(accountId);
  if (!row) return null;
  return dbRowToEntity(row);
}

async function setLoanProfile(
  profile: Omit<LoanProfileEntity, 'id'>,
): Promise<LoanProfileEntity> {
  const existing = await db.getLoanProfile(profile.account);
  const origination_date = db.toDateRepr(profile.origination_date);
  const dbFields = {
    account: profile.account,
    original_principal: profile.original_principal,
    interest_rate: profile.interest_rate,
    term_months: profile.term_months,
    origination_date,
    payment_amount: profile.payment_amount,
    escrow_amount: profile.escrow_amount,
  };

  if (existing) {
    await db.updateLoanProfile({ id: existing.id, ...dbFields, tombstone: 0 });
    return { id: existing.id, ...profile };
  }

  const id = await db.insertLoanProfile(dbFields);
  return { id, ...profile };
}

async function deleteLoanProfile({
  accountId,
}: {
  accountId: LoanProfileEntity['account'];
}): Promise<void> {
  const existing = await db.getLoanProfile(accountId);
  if (existing) {
    await db.deleteLoanProfile({ id: existing.id });
  }
}

async function getAmortizationSchedule({
  accountId,
}: {
  accountId: LoanProfileEntity['account'];
}): Promise<AmortizationPeriod[]> {
  const profile = await getLoanProfile({ accountId });
  if (!profile) throw new Error('No loan profile found for account');
  return generateAmortizationSchedule(profileToInput(profile));
}

async function getRemainingBalance({
  accountId,
  payments,
}: {
  accountId: LoanProfileEntity['account'];
  payments: PaymentRecord[];
}): Promise<number> {
  const profile = await getLoanProfile({ accountId });
  if (!profile) throw new Error('No loan profile found for account');
  return computeRemainingBalance(profileToInput(profile), payments);
}

async function getProjectedPayoffDate({
  accountId,
  payments,
}: {
  accountId: LoanProfileEntity['account'];
  payments: PaymentRecord[];
}): Promise<string | null> {
  const profile = await getLoanProfile({ accountId });
  if (!profile) throw new Error('No loan profile found for account');
  return computeProjectedPayoffDate(profileToInput(profile), payments);
}

async function computePaymentAmount({
  principal,
  annualRateBps,
  termMonths,
}: {
  principal: number;
  annualRateBps: number;
  termMonths: number;
}): Promise<number> {
  return computeMonthlyPayment(principal, annualRateBps, termMonths);
}

async function splitLoanPayment({
  totalPayment,
  currentBalance,
  annualRateBps,
}: {
  totalPayment: number;
  currentBalance: number;
  annualRateBps: number;
}): Promise<{ interest: number; principal: number }> {
  return splitPayment(totalPayment, currentBalance, annualRateBps);
}

function dbRowToEntity(row: DbLoanProfile): LoanProfileEntity {
  return {
    id: row.id,
    account: row.account,
    original_principal: row.original_principal,
    interest_rate: row.interest_rate,
    term_months: row.term_months,
    origination_date: db.fromDateRepr(row.origination_date),
    payment_amount: row.payment_amount,
    escrow_amount: row.escrow_amount,
  };
}

function profileToInput(profile: LoanProfileEntity): LoanAmortizationInput {
  return {
    original_principal: profile.original_principal,
    interest_rate: profile.interest_rate,
    term_months: profile.term_months,
    origination_date: profile.origination_date,
    payment_amount: profile.payment_amount,
  };
}
