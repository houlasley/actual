import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { FormError } from '@actual-app/components/form-error';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { priceToInteger } from '@actual-app/core/shared/securities';
import type { SecurityEntity } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import {
  Modal,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import {
  securitiesQueries,
  useDeleteSecurityMutation,
  useSetSecurityPricesMutation,
} from '#securities';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parsePriceCsv(text: string): Array<{ date: string; price: number }> {
  const lines = text
    .split(/\r\n|\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const firstCells = lines[0].split(',');
  const rows =
    firstCells.length > 0 && DATE_REGEX.test(firstCells[0].trim())
      ? lines
      : lines.slice(1);

  const prices: Array<{ date: string; price: number }> = [];
  for (const line of rows) {
    const cells = line.split(',');
    const date = cells[0]?.trim() ?? '';
    const close = Number(cells[cells.length - 1]?.trim());
    if (!DATE_REGEX.test(date) || Number.isNaN(close)) {
      continue;
    }
    prices.push({ date, price: priceToInteger(close) });
  }
  return prices;
}

export function ManageSecuritiesModal() {
  const { t } = useTranslation();
  const { data: securities = [] } = useQuery(securitiesQueries.list());

  return (
    <Modal name="manage-securities">
      {({ state }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle title={t('Manage Securities')} shrinkOnOverflow />
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View style={{ minWidth: 400 }}>
            {securities.length === 0 ? (
              <View style={{ padding: 10, color: theme.tableTextLight }}>
                <Text>
                  <Trans>No securities yet</Trans>
                </Text>
              </View>
            ) : (
              securities.map(security => (
                <SecurityRow key={security.id} security={security} />
              ))
            )}
          </View>
        </>
      )}
    </Modal>
  );
}

type SecurityRowProps = {
  security: SecurityEntity;
};

function SecurityRow({ security }: SecurityRowProps) {
  const { t } = useTranslation();
  const setPrices = useSetSecurityPricesMutation();
  const deleteSecurity = useDeleteSecurityMutation();
  const [error, setError] = useState<string | null>(null);

  const onImportFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const prices = parsePriceCsv(text);
      if (prices.length === 0) {
        setError(t('No valid prices found in file'));
        return;
      }
      setPrices.mutate({ security: security.id, prices });
    };
    reader.onerror = () => {
      setError(t('Could not read the file'));
    };
    reader.readAsText(file);
  };

  const onDelete = () => {
    setError(null);
    deleteSecurity.mutate(
      { id: security.id },
      {
        onError: e => {
          setError(e instanceof Error ? e.message : String(e));
        },
      },
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: '8px 0',
        borderBottom: `1px solid ${theme.tableBorder}`,
      }}
    >
      <Text style={{ flex: 1 }}>
        {security.ticker}
        {security.name ? ` — ${security.name}` : ''}
      </Text>
      <label
        style={{
          fontSize: 13,
          color: theme.pageTextLink,
          cursor: 'pointer',
        }}
      >
        <Trans>Import prices</Trans>
        <input
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={e => onImportFile(e.target.files?.[0])}
        />
      </label>
      <Button variant="bare" onPress={onDelete}>
        <Trans>Delete</Trans>
      </Button>
      {error && <FormError>{error}</FormError>}
    </View>
  );
}
