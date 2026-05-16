import type {
  AccountEntity,
  PayeeEntity,
  ScheduleEntity,
} from '@actual-app/core/types/models';
import { describe, expect, it } from 'vitest';

import { computeCashFlowScheduledTransactions } from './useCashFlowScheduledTransactions';

function makeAccount(overrides: Partial<AccountEntity> = {}): AccountEntity {
  return {
    id: 'acct-1',
    name: 'Checking',
    offbudget: 0,
    closed: 0,
    is_investment: 0,
    sort_order: 0,
    last_reconciled: null,
    tombstone: 0,
    account_id: null,
    bank: null,
    bankName: null,
    bankId: null,
    mask: null,
    official_name: null,
    balance_current: null,
    balance_available: null,
    balance_limit: null,
    account_sync_source: null,
    last_sync: null,
    ...overrides,
  };
}

function makePayee(overrides: Partial<PayeeEntity> = {}): PayeeEntity {
  return {
    id: 'payee-1',
    name: 'Payee',
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<ScheduleEntity> = {}): ScheduleEntity {
  return {
    id: 'sched-1',
    rule: 'rule-1',
    next_date: '2026-06-15',
    completed: false,
    posts_transaction: false,
    tombstone: false,
    _payee: 'payee-1',
    _account: 'acct-1',
    _amount: -10000,
    _amountOp: 'is',
    _date: '2026-06-15',
    _conditions: [{ op: 'is', field: 'date', value: '2026-06-15' }],
    _actions: [],
    ...overrides,
  };
}

const today = '2026-05-16';

describe('computeCashFlowScheduledTransactions', () => {
  it('returns nothing when the range ends in the past', () => {
    const result = computeCashFlowScheduledTransactions({
      schedules: [makeSchedule()],
      accountsById: { 'acct-1': makeAccount() },
      payeesById: { 'payee-1': makePayee() },
      end: '2026-04',
      today,
    });

    expect(result).toEqual([]);
  });

  it('includes a one-time future schedule within the range', () => {
    const result = computeCashFlowScheduledTransactions({
      schedules: [makeSchedule({ next_date: '2026-06-15', _amount: -10000 })],
      accountsById: { 'acct-1': makeAccount() },
      payeesById: { 'payee-1': makePayee() },
      end: '2026-07',
      today,
    });

    expect(result).toEqual([{ date: '2026-06-15', amount: -10000 }]);
  });

  it('excludes one-time schedules in the past portion of the range', () => {
    const result = computeCashFlowScheduledTransactions({
      schedules: [makeSchedule({ next_date: '2026-05-01' })],
      accountsById: { 'acct-1': makeAccount() },
      payeesById: { 'payee-1': makePayee() },
      end: '2026-07',
      today,
    });

    expect(result).toEqual([]);
  });

  it('skips completed schedules', () => {
    const result = computeCashFlowScheduledTransactions({
      schedules: [makeSchedule({ completed: true })],
      accountsById: { 'acct-1': makeAccount() },
      payeesById: { 'payee-1': makePayee() },
      end: '2026-07',
      today,
    });

    expect(result).toEqual([]);
  });

  it('skips off-budget account schedules', () => {
    const result = computeCashFlowScheduledTransactions({
      schedules: [makeSchedule()],
      accountsById: { 'acct-1': makeAccount({ offbudget: 1 }) },
      payeesById: { 'payee-1': makePayee() },
      end: '2026-07',
      today,
    });

    expect(result).toEqual([]);
  });

  it('skips transfer-payee schedules', () => {
    const result = computeCashFlowScheduledTransactions({
      schedules: [makeSchedule()],
      accountsById: { 'acct-1': makeAccount() },
      payeesById: { 'payee-1': makePayee({ transfer_acct: 'acct-2' }) },
      end: '2026-07',
      today,
    });

    expect(result).toEqual([]);
  });

  it('skips zero-amount schedules', () => {
    const result = computeCashFlowScheduledTransactions({
      schedules: [makeSchedule({ _amount: 0 })],
      accountsById: { 'acct-1': makeAccount() },
      payeesById: { 'payee-1': makePayee() },
      end: '2026-07',
      today,
    });

    expect(result).toEqual([]);
  });

  it('expands a recurring monthly schedule across the range', () => {
    const result = computeCashFlowScheduledTransactions({
      schedules: [
        makeSchedule({
          next_date: '2026-06-01',
          _amount: -5000,
          _conditions: [
            {
              op: 'is',
              field: 'date',
              value: {
                start: '2026-06-01',
                frequency: 'monthly',
                interval: 1,
                patterns: [],
                skipWeekend: false,
                endMode: 'never',
                endOccurrences: 1,
                endDate: '2026-06-01',
              },
            },
          ],
        }),
      ],
      accountsById: { 'acct-1': makeAccount() },
      payeesById: { 'payee-1': makePayee() },
      end: '2026-08',
      today,
    });

    expect(result).toEqual([
      { date: '2026-06-01', amount: -5000 },
      { date: '2026-07-01', amount: -5000 },
      { date: '2026-08-01', amount: -5000 },
    ]);
  });
});
