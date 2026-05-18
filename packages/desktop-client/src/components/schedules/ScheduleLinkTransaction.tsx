// @ts-strict-ignore
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import { format as monthUtilFormat } from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import type { TransactionEntity } from '@actual-app/core/types/models';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { Search } from '#components/common/Search';
import { Field, Row, Table, TableHeader } from '#components/table';
import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import { usePayeesById } from '#hooks/usePayees';
import { useQuery } from '#hooks/useQuery';
import { useSchedules } from '#hooks/useSchedules';
import type { Modal as ModalType } from '#modals/modalsSlice';

type ScheduleLinkTransactionProps = Extract<
  ModalType,
  { name: 'schedule-link-transaction' }
>['options'];

const ROW_HEIGHT = 43;

export function ScheduleLinkTransaction({
  scheduleId,
  onTransactionLinked,
}: ScheduleLinkTransactionProps) {
  const { t } = useTranslation();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const format = useFormat();
  const { data: payeesById } = usePayeesById();
  const [filter, setFilter] = useState('');

  const scheduleQuery = useMemo(
    () => q('schedules').filter({ id: scheduleId }).select('*'),
    [scheduleId],
  );
  const { schedules } = useSchedules({ query: scheduleQuery });
  const schedule = schedules[0];

  const transactionsQuery = useMemo(
    () =>
      schedule
        ? q('transactions')
            .filter({ account: schedule._account, schedule: null })
            .orderBy({ date: 'desc' })
            .limit(200)
            .select(['id', 'date', 'payee', 'amount', 'notes', 'imported_payee'])
        : null,
    [schedule],
  );

  const { data: transactions, isLoading } = useQuery<TransactionEntity>(
    () => transactionsQuery,
    [transactionsQuery],
  );

  const filteredTransactions = useMemo<TransactionEntity[]>(() => {
    if (!transactions) return [];
    const filterQuery = filter.toLowerCase().trim();
    return transactions.filter(t => {
      if (!filterQuery) return true;
      const payeeName = (
        (payeesById && payeesById[t.payee]?.name) ||
        t.imported_payee ||
        ''
      ).toLowerCase();
      const notesText = (t.notes || '').toLowerCase();
      const amountText = format(Math.abs(t.amount), 'financial').toLowerCase();
      return (
        payeeName.includes(filterQuery) ||
        notesText.includes(filterQuery) ||
        amountText.includes(filterQuery)
      );
    });
  }, [transactions, filter, payeesById, format]);

  async function onSelect(transactionId: string, closeFn: () => void) {
    await send('transactions-batch-update', {
      updated: [{ id: transactionId, schedule: scheduleId }],
    });
    onTransactionLinked?.();
    closeFn();
  }

  const scheduleName =
    schedule &&
    (schedule.name ||
      (payeesById && schedule._payee
        ? (payeesById[schedule._payee]?.name ?? t('(unnamed)'))
        : t('(unnamed)')));

  return (
    <Modal
      name="schedule-link-transaction"
      containerProps={{ style: { width: 800 } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={t('Link to existing transaction')}
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View
            style={{
              flexDirection: 'row',
              gap: 4,
              marginBottom: 20,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Text>
              {t('Choose the transaction for the {{name}} schedule:', {
                name: scheduleName ?? '',
              })}
            </Text>
            <Search
              isInModal
              width={250}
              placeholder={t('Filter transactions…')}
              value={filter}
              onChange={setFilter}
            />
          </View>

          <View
            style={{
              flex: `1 1 ${(ROW_HEIGHT - 1) * (Math.max((filteredTransactions?.length ?? 0), 1) + 1)}px`,
              marginTop: 15,
              maxHeight: '50vh',
            }}
          >
            <TableHeader height={ROW_HEIGHT} inset={15}>
              <Field width={100}>{t('Date')}</Field>
              <Field width="flex">{t('Payee')}</Field>
              <Field width={120} style={{ textAlign: 'right' }}>
                {t('Amount')}
              </Field>
            </TableHeader>
            <Table
              rowHeight={ROW_HEIGHT}
              style={{ backgroundColor: theme.tableBackground }}
              items={filteredTransactions ?? []}
              loading={isLoading || !schedule}
              renderItem={({ item: transaction }) => {
                const payeeName =
                  (payeesById && transaction.payee
                    ? payeesById[transaction.payee]?.name
                    : null) ||
                  transaction.imported_payee ||
                  t('Unknown');
                const amountColor =
                  transaction.amount < 0
                    ? theme.errorText
                    : theme.noticeTextDark;
                return (
                  <Row
                    key={transaction.id}
                    height={ROW_HEIGHT}
                    inset={15}
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      void onSelect(transaction.id, state.close)
                    }
                  >
                    <Field width={100}>
                      {monthUtilFormat(transaction.date, dateFormat)}
                    </Field>
                    <Field
                      width="flex"
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {payeeName}
                    </Field>
                    <Field
                      width={120}
                      style={{ textAlign: 'right', color: amountColor }}
                    >
                      {format(Math.abs(transaction.amount), 'financial')}
                    </Field>
                  </Row>
                );
              }}
              renderEmpty={() => (
                <View
                  style={{
                    textAlign: 'center',
                    color: theme.tableTextLight,
                    fontStyle: 'italic',
                    padding: 15,
                  }}
                >
                  {filter
                    ? t('No matching transactions found')
                    : t('No unlinked transactions found in this account')}
                </View>
              )}
            />
          </View>
        </>
      )}
    </Modal>
  );
}
