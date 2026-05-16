import type { CSSProperties } from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { InvestmentTransactionView } from '@actual-app/core/server/securities/app';
import {
  integerToPrice,
  integerToShares,
} from '@actual-app/core/shared/securities';
import { integerToCurrency } from '@actual-app/core/shared/util';
import type { AccountEntity } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';
import {
  securitiesQueries,
  useDeleteInvestmentTransactionMutation,
} from '#securities';

const cellStyle: CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  alignItems: 'flex-start',
  justifyContent: 'center',
};

const headerStyle: CSSProperties = {
  ...cellStyle,
  fontWeight: 600,
  color: theme.tableHeaderText,
};

type InvestmentTransactionsTableProps = {
  accountId: AccountEntity['id'];
};

export function InvestmentTransactionsTable({
  accountId,
}: InvestmentTransactionsTableProps) {
  const { data: transactions = [] } = useQuery(
    securitiesQueries.investmentTransactions(accountId),
  );

  if (transactions.length === 0) {
    return (
      <View style={{ padding: 20, color: theme.tableTextLight }}>
        <Text>
          <Trans>No transactions yet</Trans>
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          borderBottom: `1px solid ${theme.tableBorder}`,
          backgroundColor: theme.tableHeaderBackground,
        }}
      >
        <View style={headerStyle}>
          <Trans>Date</Trans>
        </View>
        <View style={headerStyle}>
          <Trans>Type</Trans>
        </View>
        <View style={headerStyle}>
          <Trans>Symbol</Trans>
        </View>
        <View style={headerStyle}>
          <Trans>Shares</Trans>
        </View>
        <View style={headerStyle}>
          <Trans>Purchase price</Trans>
        </View>
        <View style={headerStyle}>
          <Trans>Amount</Trans>
        </View>
        <View style={{ ...headerStyle, flex: 0.7 }} />
      </View>
      {transactions.map(transaction => (
        <InvestmentTransactionRow
          key={transaction.id}
          accountId={accountId}
          transaction={transaction}
        />
      ))}
    </View>
  );
}

type InvestmentTransactionRowProps = {
  accountId: AccountEntity['id'];
  transaction: InvestmentTransactionView;
};

function InvestmentTransactionRow({
  accountId,
  transaction,
}: InvestmentTransactionRowProps) {
  const dispatch = useDispatch();
  const deleteTransaction = useDeleteInvestmentTransactionMutation();

  const amount = Math.round(
    integerToShares(transaction.shares) *
      integerToPrice(transaction.price) *
      100,
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        borderBottom: `1px solid ${theme.tableBorder}`,
        color: theme.tableText,
      }}
    >
      <View style={cellStyle}>
        <Text>{transaction.date}</Text>
      </View>
      <View style={cellStyle}>
        <Text style={{ textTransform: 'capitalize' }}>{transaction.type}</Text>
      </View>
      <View style={cellStyle}>
        <Text>{transaction.ticker}</Text>
      </View>
      <View style={cellStyle}>
        <Text>{integerToShares(transaction.shares)}</Text>
      </View>
      <View style={cellStyle}>
        <Text>
          {integerToCurrency(
            Math.round(integerToPrice(transaction.price) * 100),
          )}
        </Text>
      </View>
      <View style={cellStyle}>
        <Text>{integerToCurrency(amount)}</Text>
      </View>
      <View
        style={{
          ...cellStyle,
          flex: 0.7,
          flexDirection: 'row',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <Button
          variant="bare"
          onPress={() =>
            dispatch(
              pushModal({
                modal: {
                  name: 'investment-transaction',
                  options: { accountId, transactionId: transaction.id },
                },
              }),
            )
          }
        >
          <Trans>Edit</Trans>
        </Button>
        <Button
          variant="bare"
          onPress={() => deleteTransaction.mutate({ id: transaction.id })}
        >
          <Trans>Delete</Trans>
        </Button>
      </View>
    </View>
  );
}
