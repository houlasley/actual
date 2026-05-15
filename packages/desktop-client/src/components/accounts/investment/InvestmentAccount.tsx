import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { integerToCurrency } from '@actual-app/core/shared/util';
import type { AccountEntity } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { Page } from '#components/Page';
import { useAccounts } from '#hooks/useAccounts';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';
import { securitiesQueries } from '#securities';

import { HoldingsTable } from './HoldingsTable';

type InvestmentAccountProps = {
  accountId: AccountEntity['id'];
};

export function InvestmentAccount({ accountId }: InvestmentAccountProps) {
  const dispatch = useDispatch();
  const { data: accounts = [] } = useAccounts();
  const account = accounts.find(a => a.id === accountId);

  const { data: holdings = [] } = useQuery(
    securitiesQueries.holdings(accountId),
  );

  const totalValue = holdings.reduce(
    (sum, holding) => sum + holding.market_value,
    0,
  );

  return (
    <Page header={account?.name ?? ''}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginBottom: 15,
          marginTop: 15,
        }}
      >
        <Button
          variant="primary"
          onPress={() =>
            dispatch(
              pushModal({
                modal: {
                  name: 'holding-edit',
                  options: { accountId },
                },
              }),
            )
          }
        >
          <Trans>Add holding</Trans>
        </Button>
        <Button
          onPress={() =>
            dispatch(
              pushModal({
                modal: {
                  name: 'manage-securities',
                  options: {},
                },
              }),
            )
          }
        >
          <Trans>Manage securities</Trans>
        </Button>
        <View style={{ flex: 1 }} />
        <Text style={{ fontWeight: 600 }}>
          <Trans>Total value</Trans>: {integerToCurrency(totalValue)}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: theme.tableBackground,
          borderRadius: 4,
        }}
      >
        <HoldingsTable accountId={accountId} />
      </View>
    </Page>
  );
}
