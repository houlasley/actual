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
};

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
}: ComputeCashFlowScheduledTransactionsArgs): ScheduledCashFlowDisplayEntry[] {
  const endDate = monthUtils.lastDayOfMonth(end);

  if (endDate <= today) {
    return [];
  }

  const result: ScheduledCashFlowDisplayEntry[] = [];

  for (const schedule of schedules) {
    if (schedule.completed) continue;

    // Only include on-budget accounts
    const account = accountsById[schedule._account];
    if (!account || account.offbudget) continue;

    // Skip transfer schedules (payee has transfer_acct set)
    const payee = payeesById[schedule._payee];
    if (payee?.transfer_acct) continue;

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
    });
  }, [schedules, isSchedulesLoading, accountsById, payeesById, end]);
}
