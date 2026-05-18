import { useMemo } from 'react';

import * as monthUtils from '@actual-app/core/shared/months';
import {
  extractScheduleConds,
  getNextDate,
  getScheduledAmount,
  scheduleIsRecurring,
} from '@actual-app/core/shared/schedules';
import { groupById } from '@actual-app/core/shared/util';
import type {
  AccountEntity,
  PayeeEntity,
  RuleConditionEntity,
  ScheduleEntity,
} from '@actual-app/core/types/models';
import * as d from 'date-fns';

import type { ScheduledCashFlowEntry } from '#components/reports/spreadsheets/cash-flow-spreadsheet';
import { useAccounts } from '#hooks/useAccounts';
import { usePayeesById } from '#hooks/usePayees';
import { getSchedulesQuery, useSchedules } from '#hooks/useSchedules';

export type ScheduledCashFlowDisplayEntry = ScheduledCashFlowEntry & {
  scheduleId: string;
  scheduleName?: string;
  payeeId: string;
  accountId: string;
};

const MAX_RECURRING_ITERATIONS = 1000;

type ComputeCashFlowScheduledTransactionsArgs = {
  schedules: readonly ScheduleEntity[];
  accountsById: Record<AccountEntity['id'], AccountEntity>;
  payeesById: Record<PayeeEntity['id'], PayeeEntity>;
  /** End of the report range (month or date string). */
  end: string;
  /** Current day (`YYYY-MM-DD`). */
  today: string;
  /** Rule conditions from the report filter (used to apply account filters). */
  conditions?: RuleConditionEntity[];
  /** How to combine multiple conditions ('and' | 'or'). */
  conditionsOp?: 'and' | 'or';
};

type AccountCondition = Extract<RuleConditionEntity, { field: 'account' }>;

function matchesAccountCondition(
  accountId: string,
  accountName: string,
  cond: AccountCondition,
): boolean {
  switch (cond.op) {
    case 'is':
      return accountId === (cond.value as string);
    case 'isNot':
      return accountId !== (cond.value as string);
    case 'oneOf':
      return (cond.value as string[]).includes(accountId);
    case 'notOneOf':
      return !(cond.value as string[]).includes(accountId);
    case 'contains':
      return accountName
        .toLowerCase()
        .includes((cond.value as string).toLowerCase());
    case 'doesNotContain':
      return !accountName
        .toLowerCase()
        .includes((cond.value as string).toLowerCase());
    case 'matches':
      try {
        return new RegExp(cond.value as string, 'i').test(accountName);
      } catch {
        return false;
      }
    case 'onBudget':
      return true; // Already limited to on-budget accounts
    case 'offBudget':
      return false; // No off-budget accounts pass the earlier filter
    default:
      return true;
  }
}

/**
 * Pure projection of future scheduled transactions for the cash flow report.
 * Only on-budget, non-transfer, future occurrences within the range are
 * returned. Kept side-effect free so it can be unit tested directly.
 */
export function computeCashFlowScheduledTransactions({
  schedules,
  accountsById,
  payeesById,
  end,
  today,
  conditions = [],
  conditionsOp = 'and',
}: ComputeCashFlowScheduledTransactionsArgs): ScheduledCashFlowDisplayEntry[] {
  const endDate = monthUtils.lastDayOfMonth(end);

  if (endDate <= today) {
    return [];
  }

  // Separate account conditions from other condition types so we can evaluate
  // them against schedule._account. Conditions with customName are display-only
  // and excluded from query filtering (matching the behaviour in cashFlowByDate).
  const activeConditions = conditions.filter(c => !c.customName);
  const accountConditions = activeConditions.filter(
    (c): c is AccountCondition => c.field === 'account',
  );
  const hasNonAccountConditions = activeConditions.some(
    c => c.field !== 'account',
  );

  // When conditionsOp is 'or' and there are non-account conditions we cannot
  // evaluate those conditions against schedules, so we skip account filtering
  // entirely to avoid incorrectly excluding schedules that would be matched by
  // the non-account conditions in the actual query.
  const shouldApplyAccountFilter =
    accountConditions.length > 0 &&
    !(conditionsOp === 'or' && hasNonAccountConditions);

  const result: ScheduledCashFlowDisplayEntry[] = [];

  for (const schedule of schedules) {
    if (schedule.completed) continue;

    // Only include on-budget accounts
    const account = accountsById[schedule._account];
    if (!account || account.offbudget) continue;

    // Skip transfer schedules (payee has transfer_acct set)
    const payee = payeesById[schedule._payee];
    if (payee?.transfer_acct) continue;

    // Apply account filter conditions
    if (shouldApplyAccountFilter) {
      const results = accountConditions.map(cond =>
        matchesAccountCondition(schedule._account, account.name, cond),
      );
      const passes =
        conditionsOp === 'or'
          ? results.some(r => r)
          : results.every(r => r);
      if (!passes) continue;
    }

    const amount = getScheduledAmount(schedule._amount);
    if (amount === 0) continue;

    const { date: dateConditions } = extractScheduleConds(schedule._conditions);
    if (!dateConditions) continue;

    const isRecurring = scheduleIsRecurring(dateConditions);
    const displayFields = {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      payeeId: schedule._payee,
      accountId: schedule._account,
    };

    if (!isRecurring) {
      // One-time schedule: include if it's in the future portion of the range
      const schedDate = schedule.next_date;
      if (schedDate && schedDate > today && schedDate <= endDate) {
        result.push({ date: schedDate, amount, ...displayFields });
      }
    } else {
      // Recurring schedule: generate all occurrences from tomorrow to end of range
      const rangeEnd = d.parseISO(endDate);
      const startFrom = d.parseISO(monthUtils.addDays(today, 1));

      // Find first occurrence at or after startFrom
      let current = getNextDate(dateConditions, startFrom);
      let iterations = 0;

      while (
        current !== null &&
        current <= endDate &&
        iterations < MAX_RECURRING_ITERATIONS
      ) {
        if (current > today) {
          result.push({ date: current, amount, ...displayFields });
        }

        // Advance to next occurrence
        const nextStart = d.addDays(d.parseISO(current), 1);
        if (nextStart > rangeEnd) break;
        current = getNextDate(dateConditions, nextStart);
        iterations++;
      }
    }
  }

  return result;
}

/**
 * Computes the future scheduled transactions used to project the cash flow
 * report past today. Shared by the dashboard card and the expanded report so
 * the two views stay in sync.
 */
export function useCashFlowScheduledTransactions(
  end: string,
  conditions?: RuleConditionEntity[],
  conditionsOp?: 'and' | 'or',
): ScheduledCashFlowDisplayEntry[] {
  const schedulesQuery = useMemo(() => getSchedulesQuery(), []);
  const { schedules, isLoading: isSchedulesLoading } = useSchedules({
    query: schedulesQuery,
  });
  const { data: accounts = [] } = useAccounts();
  const { data: payeesById = {} } = usePayeesById();

  const accountsById = useMemo(() => groupById(accounts), [accounts]);

  return useMemo((): ScheduledCashFlowDisplayEntry[] => {
    if (isSchedulesLoading) return [];

    return computeCashFlowScheduledTransactions({
      schedules,
      accountsById,
      payeesById,
      end,
      today: monthUtils.currentDay(),
      conditions,
      conditionsOp,
    });
  }, [
    schedules,
    isSchedulesLoading,
    accountsById,
    payeesById,
    end,
    conditions,
    conditionsOp,
  ]);
}
