import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { AlignedText } from '@actual-app/components/aligned-text';
import { Block } from '@actual-app/components/block';
import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Paragraph } from '@actual-app/components/paragraph';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import type { Query } from '@actual-app/core/shared/query';
import { ungroupTransactions } from '@actual-app/core/shared/transactions';
import type {
  CashFlowWidget,
  RuleConditionEntity,
  TimeFrame,
  TransactionEntity,
} from '@actual-app/core/types/models';
import * as d from 'date-fns';

import { EditablePageHeaderTitle } from '#components/EditablePageHeaderTitle';
import { FinancialText } from '#components/FinancialText';
import { MobileBackButton } from '#components/mobile/MobileBackButton';
import { MobilePageHeader, Page, PageHeader } from '#components/Page';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { Change } from '#components/reports/Change';
import { CashFlowGraph } from '#components/reports/graphs/CashFlowGraph';
import { Header } from '#components/reports/Header';
import { LoadingIndicator } from '#components/reports/LoadingIndicator';
import {
  calculateTimeRange,
  getNextMonthsRange,
  getStraddleRange,
} from '#components/reports/reportRanges';
import {
  cashFlowByDate,
  isConciseTimeRange,
} from '#components/reports/spreadsheets/cash-flow-spreadsheet';
import {
  useCashFlowScheduledTransactions,
  type ScheduledCashFlowDisplayEntry,
} from '#components/reports/useCashFlowScheduledTransactions';
import { useReport } from '#components/reports/useReport';
import type { TableHandleRef } from '#components/table';
import { TransactionList } from '#components/transactions/TransactionList';
import { useAccounts } from '#hooks/useAccounts';
import { SchedulesProvider } from '#hooks/useCachedSchedules';
import { useCategories } from '#hooks/useCategories';
import { useDashboardWidget } from '#hooks/useDashboardWidget';
import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import { useNavigate } from '#hooks/useNavigate';
import { usePayees } from '#hooks/usePayees';
import { useRuleConditionFilters } from '#hooks/useRuleConditionFilters';
import { SelectedProviderWithItems } from '#hooks/useSelected';
import { SplitsExpandedProvider } from '#hooks/useSplitsExpanded';
import { useSyncedPref } from '#hooks/useSyncedPref';
import { useTransactions } from '#hooks/useTransactions';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';
import { useUpdateDashboardWidgetMutation } from '#reports/mutations';

export const defaultTimeFrame = {
  start: monthUtils.dayFromDate(monthUtils.currentMonth()),
  end: monthUtils.currentDay(),
  mode: 'sliding-window',
} satisfies TimeFrame;

export function CashFlow() {
  const params = useParams();
  const { data: widget, isPending } = useDashboardWidget<CashFlowWidget>({
    id: params.id,
    type: 'cash-flow-card',
  });

  if (isPending) {
    return <LoadingIndicator />;
  }

  return <CashFlowInner widget={widget} />;
}

type CashFlowInnerProps = {
  widget?: CashFlowWidget;
};

type SelectedBar = {
  date: Date;
  type: 'income' | 'expenses';
  projected: boolean;
};

function CashFlowInner({ widget }: CashFlowInnerProps) {
  const locale = useLocale();
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const format = useFormat();

  const {
    conditions,
    conditionsOp,
    onApply: onApplyFilter,
    onDelete: onDeleteFilter,
    onUpdate: onUpdateFilter,
    onConditionsOpChange,
  } = useRuleConditionFilters<RuleConditionEntity>(
    widget?.meta?.conditions,
    widget?.meta?.conditionsOp,
  );

  const [allMonths, setAllMonths] = useState<null | Array<{
    name: string;
    pretty: string;
  }>>(null);

  const [start, setStart] = useState(monthUtils.currentMonth());
  const [end, setEnd] = useState(monthUtils.currentMonth());
  const [mode, setMode] = useState<TimeFrame['mode']>('sliding-window');
  const [showBalance, setShowBalance] = useState(
    widget?.meta?.showBalance ?? true,
  );
  const [latestTransaction, setLatestTransaction] = useState('');

  const [selectedBar, setSelectedBar] = useState<SelectedBar | null>(null);
  const [barQuery, setBarQuery] = useState<Query | undefined>(undefined);
  const [sortField, setSortField] = useState('');
  const [ascDesc, setAscDesc] = useState<'asc' | 'desc'>('desc');

  const table = useRef<TableHandleRef<TransactionEntity>>(null);

  const { data: accounts = [] } = useAccounts();
  const { data: payees = [] } = usePayees();
  const { data: { grouped: categoryGroups } = { grouped: [] } } =
    useCategories();
  const dateFormat = useDateFormat();

  const {
    transactions: transactionsGrouped,
    fetchNextPage: loadMoreTransactions,
  } = useTransactions({ query: barQuery });

  const allTransactions = useMemo(
    () => ungroupTransactions(transactionsGrouped as TransactionEntity[]),
    [transactionsGrouped],
  );

  const isConcise = isConciseTimeRange(start, end);

  const scheduledTransactions = useCashFlowScheduledTransactions(
    end,
    conditions,
    conditionsOp,
  );

  const params = useMemo(
    () =>
      cashFlowByDate(
        start,
        end,
        isConcise,
        conditions,
        conditionsOp,
        locale,
        format,
        scheduledTransactions,
      ),
    [
      start,
      end,
      isConcise,
      conditions,
      conditionsOp,
      locale,
      format,
      scheduledTransactions,
    ],
  );
  const data = useReport('cash_flow', params);

  useEffect(() => {
    async function run() {
      const earliestTransaction = await send('get-earliest-transaction');
      setEarliestTransaction(
        earliestTransaction
          ? earliestTransaction.date
          : monthUtils.currentDay(),
      );

      const latestTransaction = await send('get-latest-transaction');
      setLatestTransaction(
        latestTransaction ? latestTransaction.date : monthUtils.currentDay(),
      );

      const currentMonth = monthUtils.currentMonth();
      const earliestMonth = earliestTransaction
        ? monthUtils.monthFromDate(d.parseISO(earliestTransaction.date))
        : currentMonth;
      const latestTransactionMonth = latestTransaction
        ? monthUtils.monthFromDate(d.parseISO(latestTransaction.date))
        : currentMonth;

      const futureMonth = monthUtils.addMonths(currentMonth, 12);
      const latestMonth =
        latestTransactionMonth > futureMonth
          ? latestTransactionMonth
          : futureMonth;

      const allMonths = monthUtils
        .rangeInclusive(earliestMonth, latestMonth)
        .map(month => ({
          name: month,
          pretty: monthUtils.format(month, 'MMMM yyyy', locale),
        }))
        .reverse();

      setAllMonths(allMonths);
    }
    void run();
  }, [locale]);

  useEffect(() => {
    if (latestTransaction) {
      const [initialStart, initialEnd, initialMode] = calculateTimeRange(
        widget?.meta?.timeFrame,
        defaultTimeFrame,
        latestTransaction,
      );
      setStart(initialStart);
      setEnd(initialEnd);
      setMode(initialMode);
    }
  }, [latestTransaction, widget?.meta?.timeFrame]);

  useEffect(() => {
    if (!selectedBar || selectedBar.projected) {
      setBarQuery(undefined);
      return;
    }

    const dateStr = monthUtils.dayFromDate(selectedBar.date);
    const startDate = isConcise
      ? monthUtils.firstDayOfMonth(dateStr)
      : dateStr;
    const endDate = isConcise ? monthUtils.lastDayOfMonth(dateStr) : dateStr;
    const conditionsOpKey = conditionsOp === 'or' ? '$or' : '$and';
    const amountFilter =
      selectedBar.type === 'income'
        ? { amount: { $gt: 0 } }
        : { amount: { $lt: 0 } };

    send('make-filters-from-conditions', {
      conditions: conditions.filter(cond => !cond.customName),
    })
      .then((result: { filters: unknown[] }) => {
        const baseQuery = q('transactions')
          .filter({ [conditionsOpKey]: result.filters })
          .filter({
            $and: [
              { date: { $gte: startDate } },
              { date: { $lte: endDate } },
              { 'account.offbudget': false },
              { 'payee.transfer_acct': null },
              amountFilter,
            ],
          });

        const sortedQuery = sortField
          ? baseQuery.orderBy({ [getField(sortField)]: ascDesc })
          : baseQuery.orderBy({ date: 'desc' });

        setBarQuery(sortedQuery.select('*').options({ splits: 'grouped' }));
      })
      .catch((error: unknown) => {
        console.error('Error generating filters:', error);
      });
  }, [selectedBar, conditions, conditionsOp, isConcise, sortField, ascDesc]);

  function onChangeDates(start: string, end: string, mode: TimeFrame['mode']) {
    setStart(start);
    setEnd(end);
    setMode(mode);
  }

  function handleBarClick(
    date: Date,
    type: 'income' | 'expenses',
    projected: boolean,
  ) {
    setSelectedBar(prev =>
      prev?.date.getTime() === date.getTime() && prev.type === type
        ? null
        : { date, type, projected },
    );
  }

  const filteredScheduledEntries = useMemo((): ScheduledCashFlowDisplayEntry[] => {
    if (!selectedBar?.projected) return [];
    const dateStr = monthUtils.dayFromDate(selectedBar.date);
    const startDate = isConcise
      ? monthUtils.firstDayOfMonth(dateStr)
      : dateStr;
    const endDate = isConcise ? monthUtils.lastDayOfMonth(dateStr) : dateStr;
    return scheduledTransactions.filter(entry => {
      if (entry.date < startDate || entry.date > endDate) return false;
      return selectedBar.type === 'income'
        ? entry.amount > 0
        : entry.amount < 0;
    });
  }, [selectedBar, scheduledTransactions, isConcise]);

  const onSort = useCallback(
    (headerClicked: string, newAscDesc: 'asc' | 'desc') => {
      if (headerClicked === sortField) {
        setAscDesc(newAscDesc);
      } else {
        setSortField(headerClicked);
        setAscDesc('desc');
      }
    },
    [sortField],
  );

  const navigate = useNavigate();
  const { isNarrowWidth } = useResponsive();
  const updateDashboardWidgetMutation = useUpdateDashboardWidgetMutation();

  async function onSaveWidget() {
    if (!widget) {
      throw new Error('No widget that could be saved.');
    }

    updateDashboardWidgetMutation.mutate(
      {
        widget: {
          id: widget.id,
          meta: {
            ...(widget.meta ?? {}),
            conditions,
            conditionsOp,
            timeFrame: {
              start,
              end,
              mode,
            },
            showBalance,
          },
        },
      },
      {
        onSuccess: () => {
          dispatch(
            addNotification({
              notification: {
                type: 'message',
                message: t('Dashboard widget successfully saved.'),
              },
            }),
          );
        },
      },
    );
  }

  const title = widget?.meta?.name || t('Cash Flow');
  const onSaveWidgetName = async (newName: string) => {
    if (!widget) {
      throw new Error('No widget that could be saved.');
    }

    const name = newName || t('Cash Flow');
    updateDashboardWidgetMutation.mutate({
      widget: {
        id: widget.id,
        meta: {
          ...(widget.meta ?? {}),
          name,
        },
      },
    });
  };

  const [earliestTransaction, setEarliestTransaction] = useState('');
  const [_firstDayOfWeekIdx] = useSyncedPref('firstDayOfWeekIdx');
  const firstDayOfWeekIdx = _firstDayOfWeekIdx || '0';

  if (!allMonths || !data) {
    return null;
  }

  const {
    graphData,
    totalExpenses,
    totalIncome,
    totalTransfers,
    projectedTotalIncome,
    projectedTotalExpenses,
  } = data;

  const hasProjected =
    projectedTotalIncome !== 0 || projectedTotalExpenses !== 0;

  const selectedBarLabel = selectedBar
    ? d.format(
        selectedBar.date,
        isConcise ? 'MMMM yyyy' : 'MMMM d, yyyy',
        { locale },
      )
    : '';

  return (
    <Page
      header={
        isNarrowWidth ? (
          <MobilePageHeader
            title={title}
            leftContent={
              <MobileBackButton onPress={() => navigate('/reports')} />
            }
          />
        ) : (
          <PageHeader
            title={
              widget ? (
                <EditablePageHeaderTitle
                  title={title}
                  onSave={onSaveWidgetName}
                />
              ) : (
                title
              )
            }
          />
        )
      }
      padding={0}
    >
      <Header
        allMonths={allMonths}
        start={start}
        end={end}
        earliestTransaction={earliestTransaction}
        latestTransaction={latestTransaction}
        firstDayOfWeekIdx={firstDayOfWeekIdx}
        mode={mode}
        show1Month
        onChangeDates={onChangeDates}
        onApply={onApplyFilter}
        filters={conditions}
        onUpdateFilter={onUpdateFilter}
        onDeleteFilter={onDeleteFilter}
        conditionsOp={conditionsOp}
        onConditionsOpChange={onConditionsOpChange}
      >
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button onPress={() => setShowBalance(state => !state)}>
            {showBalance ? t('Hide balance') : t('Show balance')}
          </Button>

          {widget && (
            <Button variant="primary" onPress={onSaveWidget}>
              <Trans>Save widget</Trans>
            </Button>
          )}
        </View>
      </Header>
      <View
        style={{
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 10,
          flexShrink: 0,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 5,
          borderBottom: `1px solid ${theme.tableBorder}`,
        }}
      >
        <Button
          variant="bare"
          onPress={() => onChangeDates(...getNextMonthsRange(3))}
        >
          <Trans>Next 3 months</Trans>
        </Button>
        <Button
          variant="bare"
          onPress={() => onChangeDates(...getNextMonthsRange(6))}
        >
          <Trans>Next 6 months</Trans>
        </Button>
        <Button
          variant="bare"
          onPress={() => onChangeDates(...getNextMonthsRange(12))}
        >
          <Trans>Next 12 months</Trans>
        </Button>
        <Button
          variant="bare"
          onPress={() => onChangeDates(...getStraddleRange(3))}
        >
          <Trans>Last 3 + Next 3</Trans>
        </Button>
        <Button
          variant="bare"
          onPress={() => onChangeDates(...getStraddleRange(6))}
        >
          <Trans>Last 6 + Next 6</Trans>
        </Button>
      </View>
      <View
        style={{
          backgroundColor: theme.tableBackground,
          padding: 20,
          paddingTop: 0,
          flex: '1 0 auto',
          overflowY: 'auto',
        }}
      >
        <View
          style={{
            paddingTop: 20,
            alignItems: 'flex-end',
            color: theme.pageText,
          }}
        >
          <AlignedText
            style={{ marginBottom: 5, minWidth: 160 }}
            left={
              <Block>
                <Trans>Income:</Trans>
              </Block>
            }
            right={
              <FinancialText style={{ fontWeight: 600 }}>
                <PrivacyFilter>
                  {format(totalIncome, 'financial')}
                </PrivacyFilter>
              </FinancialText>
            }
          />

          <AlignedText
            style={{ marginBottom: 5, minWidth: 160 }}
            left={
              <Block>
                <Trans>Expenses:</Trans>
              </Block>
            }
            right={
              <FinancialText style={{ fontWeight: 600 }}>
                <PrivacyFilter>
                  {format(totalExpenses, 'financial')}
                </PrivacyFilter>
              </FinancialText>
            }
          />

          <AlignedText
            style={{ marginBottom: 5, minWidth: 160 }}
            left={
              <Block>
                <Trans>Transfers:</Trans>
              </Block>
            }
            right={
              <FinancialText style={{ fontWeight: 600 }}>
                <PrivacyFilter>
                  {format(totalTransfers, 'financial')}
                </PrivacyFilter>
              </FinancialText>
            }
          />
          <Text style={{ fontWeight: 600 }}>
            <PrivacyFilter>
              <Change amount={totalIncome + totalExpenses + totalTransfers} />
            </PrivacyFilter>
          </Text>

          {hasProjected && (
            <>
              <View
                style={{
                  borderTop: `1px solid ${theme.tableBorder}`,
                  marginTop: 10,
                  paddingTop: 10,
                  width: '100%',
                }}
              />
              <AlignedText
                style={{
                  marginBottom: 5,
                  minWidth: 160,
                  color: theme.pageTextLight,
                }}
                left={
                  <Block>
                    <Trans>Projected income:</Trans>
                  </Block>
                }
                right={
                  <FinancialText style={{ fontWeight: 600 }}>
                    <PrivacyFilter>
                      {format(projectedTotalIncome, 'financial')}
                    </PrivacyFilter>
                  </FinancialText>
                }
              />
              <AlignedText
                style={{
                  marginBottom: 5,
                  minWidth: 160,
                  color: theme.pageTextLight,
                }}
                left={
                  <Block>
                    <Trans>Projected expenses:</Trans>
                  </Block>
                }
                right={
                  <FinancialText style={{ fontWeight: 600 }}>
                    <PrivacyFilter>
                      {format(projectedTotalExpenses, 'financial')}
                    </PrivacyFilter>
                  </FinancialText>
                }
              />
            </>
          )}
        </View>

        <CashFlowGraph
          graphData={graphData}
          isConcise={isConcise}
          showBalance={showBalance}
          onBarClick={handleBarClick}
        />

        {selectedBar && (
          <View style={{ marginTop: 20 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 10,
                borderBottom: `1px solid ${theme.tableBorder}`,
                marginBottom: 4,
              }}
            >
              <Text style={{ fontWeight: 600, fontSize: 14 }}>
                {selectedBar.projected
                  ? selectedBar.type === 'income'
                    ? t('Scheduled income')
                    : t('Scheduled expenses')
                  : selectedBar.type === 'income'
                    ? t('Income transactions')
                    : t('Expense transactions')}
                {' — '}
                {selectedBarLabel}
              </Text>
              <Button
                variant="bare"
                onPress={() => setSelectedBar(null)}
                style={{ color: theme.pageTextSubdued }}
              >
                <Trans>Close</Trans>
              </Button>
            </View>

            {selectedBar.projected ? (
              <View style={{ flex: '1 0 200px' }}>
                {filteredScheduledEntries.length === 0 ? (
                  <View
                    style={{
                      color: theme.tableText,
                      marginTop: 20,
                      textAlign: 'center',
                      fontStyle: 'italic',
                    }}
                  >
                    <Trans>No scheduled transactions</Trans>
                  </View>
                ) : (
                  <View>
                    <View
                      style={{
                        flexDirection: 'row',
                        paddingTop: 6,
                        paddingBottom: 6,
                        paddingLeft: 4,
                        paddingRight: 4,
                        borderBottom: `1px solid ${theme.tableBorder}`,
                        color: theme.tableHeaderText,
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      <Text style={{ flex: 1 }}>
                        <Trans>Date</Trans>
                      </Text>
                      <Text style={{ flex: 2 }}>
                        <Trans>Payee</Trans>
                      </Text>
                      <Text style={{ flex: 2 }}>
                        <Trans>Account</Trans>
                      </Text>
                      <Text style={{ flex: 1, textAlign: 'right' }}>
                        <Trans>Amount</Trans>
                      </Text>
                    </View>
                    {filteredScheduledEntries.map((entry, idx) => {
                      const payee = payees.find(p => p.id === entry.payeeId);
                      const account = accounts.find(
                        a => a.id === entry.accountId,
                      );
                      return (
                        <View
                          key={idx}
                          style={{
                            flexDirection: 'row',
                            paddingTop: 8,
                            paddingBottom: 8,
                            paddingLeft: 4,
                            paddingRight: 4,
                            borderBottom: `1px solid ${theme.tableBorder}`,
                            color: theme.tableText,
                            fontSize: 13,
                          }}
                        >
                          <Text style={{ flex: 1, color: theme.tableText }}>
                            {d.format(
                              d.parseISO(entry.date),
                              isConcise ? 'MMM yyyy' : 'MMM d, yyyy',
                              { locale },
                            )}
                          </Text>
                          <Text style={{ flex: 2, color: theme.tableText }}>
                            {entry.scheduleName ||
                              payee?.name ||
                              t('Unknown payee')}
                          </Text>
                          <Text
                            style={{
                              flex: 2,
                              color: theme.tableTextLight,
                            }}
                          >
                            {account?.name || t('Unknown account')}
                          </Text>
                          <FinancialText
                            style={{
                              flex: 1,
                              textAlign: 'right',
                              color:
                                entry.amount > 0
                                  ? theme.reportsNumberPositive
                                  : theme.reportsNumberNegative,
                            }}
                          >
                            <PrivacyFilter>
                              {format(entry.amount, 'financial')}
                            </PrivacyFilter>
                          </FinancialText>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : (
              <View style={{ flex: '1 0 300px' }}>
                <SelectedProviderWithItems
                  name="transactions"
                  items={[]}
                  fetchAllIds={async () => []}
                  registerDispatch={() => {}}
                  selectAllFilter={(item: TransactionEntity) =>
                    !item._unmatched && !item.is_parent
                  }
                >
                  <SchedulesProvider query={undefined}>
                    <SplitsExpandedProvider initialMode="collapse">
                      <TransactionList
                        tableRef={table}
                        account={undefined}
                        transactions={transactionsGrouped}
                        allTransactions={allTransactions}
                        loadMoreTransactions={loadMoreTransactions}
                        accounts={accounts}
                        category={undefined}
                        categoryGroups={categoryGroups}
                        payees={payees}
                        balances={null}
                        showBalances={false}
                        showReconciled
                        showCleared={false}
                        showAccount
                        isAdding={false}
                        isNew={() => false}
                        isMatched={() => false}
                        dateFormat={dateFormat}
                        hideFraction={false}
                        renderEmpty={() => (
                          <View
                            style={{
                              color: theme.tableText,
                              marginTop: 20,
                              textAlign: 'center',
                              fontStyle: 'italic',
                            }}
                          >
                            <Trans>No transactions</Trans>
                          </View>
                        )}
                        onSort={onSort}
                        sortField={sortField}
                        ascDesc={ascDesc}
                        onChange={() => {}}
                        onRefetch={() => {}}
                        onCloseAddTransaction={() => {}}
                        onCreatePayee={async () => null}
                        onApplyFilter={() => {}}
                        onBatchDelete={() => {}}
                        onBatchDuplicate={() => {}}
                        onBatchLinkSchedule={() => {}}
                        onBatchUnlinkSchedule={() => {}}
                        onCreateRule={() => {}}
                        onScheduleAction={() => {}}
                        onMakeAsNonSplitTransactions={() => {}}
                        showSelection={false}
                        allowSplitTransaction={false}
                        allowReorder={false}
                      />
                    </SplitsExpandedProvider>
                  </SchedulesProvider>
                </SelectedProviderWithItems>
              </View>
            )}
          </View>
        )}

        <View
          style={{
            marginTop: 30,
            userSelect: 'none',
          }}
        >
          <Trans>
            <Paragraph>
              <strong>How is cash flow calculated?</strong>
            </Paragraph>
            <Paragraph>
              Cash flow shows the balance of your budgeted accounts over time,
              and the amount of expenses/income each day or month. Your budgeted
              accounts are considered to be "cash on hand," so this gives you a
              picture of how available money fluctuates.
            </Paragraph>
          </Trans>
          {hasProjected && (
            <Trans>
              <Paragraph>
                Future dates show projected balances based on your scheduled
                transactions.
              </Paragraph>
            </Trans>
          )}
        </View>
      </View>
    </Page>
  );
}

function getField(field?: string) {
  if (!field) {
    return 'date';
  }

  switch (field) {
    case 'account':
      return 'account.name';
    case 'payee':
      return 'payee.name';
    case 'category':
      return 'category.name';
    case 'payment':
      return 'amount';
    case 'deposit':
      return 'amount';
    default:
      return field;
  }
}
