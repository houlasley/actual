import { useState } from 'react';
import type { FormEvent } from 'react';
import { Form } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { FormError } from '@actual-app/components/form-error';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { InlineField } from '@actual-app/components/inline-field';
import { Input } from '@actual-app/components/input';
import { Select } from '@actual-app/components/select';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import {
  integerToPrice,
  integerToShares,
  priceToInteger,
  sharesToInteger,
} from '@actual-app/core/shared/securities';
import type { InvestmentTransactionType } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';

import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import {
  securitiesQueries,
  useCreateInvestmentTransactionMutation,
  useCreateSecurityMutation,
  useUpdateInvestmentTransactionMutation,
} from '#securities';

type InvestmentTransactionModalProps = {
  accountId: string;
  transactionId?: string;
};

export function InvestmentTransactionModal({
  accountId,
  transactionId,
}: InvestmentTransactionModalProps) {
  const { t } = useTranslation();

  const { data: transactions = [] } = useQuery(
    securitiesQueries.investmentTransactions(accountId),
  );
  const existing = transactionId
    ? transactions.find(tx => tx.id === transactionId)
    : undefined;

  const [ticker, setTicker] = useState(existing?.ticker ?? '');
  const [name, setName] = useState(existing?.security_name ?? '');
  const [type, setType] = useState<InvestmentTransactionType>(
    existing?.type ?? 'buy',
  );
  const [date, setDate] = useState(existing?.date ?? monthUtils.currentDay());
  const [shares, setShares] = useState(
    existing ? String(integerToShares(existing.shares)) : '',
  );
  const [price, setPrice] = useState(
    existing ? String(integerToPrice(existing.price)) : '',
  );
  const [error, setError] = useState<string | null>(null);

  const createSecurity = useCreateSecurityMutation();
  const createTransaction = useCreateInvestmentTransactionMutation();
  const updateTransaction = useUpdateInvestmentTransactionMutation();

  const onSubmit = async (
    event: FormEvent<HTMLFormElement>,
    close: () => void,
  ) => {
    event.preventDefault();
    setError(null);

    const trimmedTicker = ticker.trim();
    if (!trimmedTicker) {
      setError(t('Symbol is required'));
      return;
    }

    const parsedShares = Number(shares.trim());
    const parsedPrice = Number(price.trim());
    if (!Number.isFinite(parsedShares) || parsedShares <= 0) {
      setError(t('Shares must be a positive number'));
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError(t('Purchase price must be a non-negative number'));
      return;
    }
    if (!date) {
      setError(t('Date is required'));
      return;
    }

    try {
      const security = await createSecurity.mutateAsync({
        ticker: trimmedTicker,
        name: name.trim() || null,
      });

      if (transactionId) {
        await updateTransaction.mutateAsync({
          id: transactionId,
          security: security.id,
          date,
          type,
          shares: sharesToInteger(parsedShares),
          price: priceToInteger(parsedPrice),
        });
      } else {
        await createTransaction.mutateAsync({
          account: accountId,
          security: security.id,
          date,
          type,
          shares: sharesToInteger(parsedShares),
          price: priceToInteger(parsedPrice),
        });
      }

      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal name="investment-transaction">
      {({ state }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle
                title={
                  transactionId
                    ? t('Edit Investment Transaction')
                    : t('Add Investment Transaction')
                }
                shrinkOnOverflow
              />
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View>
            <Form onSubmit={event => onSubmit(event, () => state.close())}>
              <InlineField label={t('Symbol')} width="100%">
                <InitialFocus>
                  <Input
                    name="ticker"
                    value={ticker}
                    onChangeValue={setTicker}
                    style={{ flex: 1 }}
                  />
                </InitialFocus>
              </InlineField>
              <InlineField label={t('Name')} width="100%">
                <Input
                  name="name"
                  value={name ?? ''}
                  onChangeValue={setName}
                  style={{ flex: 1 }}
                />
              </InlineField>
              <InlineField label={t('Type')} width="100%">
                <Select
                  options={[
                    ['buy', t('Buy')],
                    ['sell', t('Sell')],
                  ]}
                  value={type}
                  onChange={value =>
                    setType(value as InvestmentTransactionType)
                  }
                  style={{ flex: 1 }}
                />
              </InlineField>
              <InlineField label={t('Date')} width="100%">
                <Input
                  name="date"
                  type="date"
                  value={date}
                  onChangeValue={setDate}
                  style={{ flex: 1 }}
                />
              </InlineField>
              <InlineField label={t('Shares')} width="100%">
                <Input
                  name="shares"
                  inputMode="decimal"
                  value={shares}
                  onChangeValue={setShares}
                  style={{ flex: 1 }}
                />
              </InlineField>
              <InlineField label={t('Purchase price')} width="100%">
                <Input
                  name="price"
                  inputMode="decimal"
                  value={price}
                  onChangeValue={setPrice}
                  style={{ flex: 1 }}
                />
              </InlineField>
              {error && (
                <FormError style={{ marginLeft: 75 }}>{error}</FormError>
              )}

              <ModalButtons>
                <Button onPress={() => state.close()}>
                  <Trans>Cancel</Trans>
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  style={{ marginLeft: 10 }}
                >
                  <Trans>Save</Trans>
                </Button>
              </ModalButtons>
            </Form>
          </View>
        </>
      )}
    </Modal>
  );
}
