import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { HoldingView } from '@actual-app/core/server/securities/app';
import * as monthUtils from '@actual-app/core/shared/months';
import {
  integerToPrice,
  integerToShares,
  priceToInteger,
} from '@actual-app/core/shared/securities';
import { integerToCurrency } from '@actual-app/core/shared/util';
import type { AccountEntity } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';
import {
  securitiesQueries,
  useDeleteHoldingMutation,
  useSetSecurityPricesMutation,
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

type HoldingsTableProps = {
  accountId: AccountEntity['id'];
};

export function HoldingsTable({ accountId }: HoldingsTableProps) {
  const { data: holdings = [] } = useQuery(
    securitiesQueries.holdings(accountId),
  );

  if (holdings.length === 0) {
    return (
      <View style={{ padding: 20, color: theme.tableTextLight }}>
        <Text>
          <Trans>No holdings yet</Trans>
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
          <Trans>Symbol</Trans>
        </View>
        <View style={headerStyle}>
          <Trans>Name</Trans>
        </View>
        <View style={headerStyle}>
          <Trans>Shares</Trans>
        </View>
        <View style={headerStyle}>
          <Trans>Price</Trans>
        </View>
        <View style={headerStyle}>
          <Trans>Cost basis</Trans>
        </View>
        <View style={headerStyle}>
          <Trans>Market value</Trans>
        </View>
        <View style={headerStyle}>
          <Trans>Gain</Trans>
        </View>
        <View style={{ ...headerStyle, flex: 0.7 }} />
      </View>
      {holdings.map(holding => (
        <HoldingRow key={holding.id} accountId={accountId} holding={holding} />
      ))}
    </View>
  );
}

type HoldingRowProps = {
  accountId: AccountEntity['id'];
  holding: HoldingView;
};

function HoldingRow({ accountId, holding }: HoldingRowProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const setPrices = useSetSecurityPricesMutation();
  const deleteHolding = useDeleteHoldingMutation();

  const [priceText, setPriceText] = useState(
    String(integerToPrice(holding.price)),
  );

  const onCommitPrice = (value: string) => {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    if (trimmed === '' || Number.isNaN(parsed)) {
      setPriceText(String(integerToPrice(holding.price)));
      return;
    }
    setPrices.mutate({
      security: holding.security,
      prices: [
        {
          date: monthUtils.currentDay(),
          price: priceToInteger(parsed),
        },
      ],
    });
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        borderBottom: `1px solid ${theme.tableBorder}`,
        color: theme.tableText,
      }}
    >
      <View style={cellStyle}>
        <Text>{holding.ticker}</Text>
      </View>
      <View style={cellStyle}>
        <Text>{holding.security_name ?? ''}</Text>
      </View>
      <View style={cellStyle}>
        <Text>{integerToShares(holding.shares)}</Text>
      </View>
      <View style={cellStyle}>
        <Input
          aria-label={t('Price')}
          inputMode="decimal"
          value={priceText}
          onChangeValue={setPriceText}
          onUpdate={onCommitPrice}
          onEnter={onCommitPrice}
          style={{ width: 90 }}
        />
      </View>
      <View style={cellStyle}>
        <Text>{integerToCurrency(holding.cost_basis)}</Text>
      </View>
      <View style={cellStyle}>
        <Text>{integerToCurrency(holding.market_value)}</Text>
      </View>
      <View style={cellStyle}>
        <Text>
          {integerToCurrency(holding.gain)}
          {holding.gain_percent != null
            ? ` (${(holding.gain_percent * 100).toFixed(2)}%)`
            : ''}
        </Text>
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
                  name: 'holding-edit',
                  options: { accountId, holdingId: holding.id },
                },
              }),
            )
          }
        >
          <Trans>Edit</Trans>
        </Button>
        <Button
          variant="bare"
          onPress={() => deleteHolding.mutate({ id: holding.id })}
        >
          <Trans>Delete</Trans>
        </Button>
      </View>
    </View>
  );
}
