import { useState } from 'react';
import type { FormEvent } from 'react';
import { Form } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { FormError } from '@actual-app/components/form-error';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { InlineField } from '@actual-app/components/inline-field';
import { Input } from '@actual-app/components/input';
import { View } from '@actual-app/components/view';
import {
  integerToShares,
  sharesToInteger,
} from '@actual-app/core/shared/securities';
import { amountToInteger } from '@actual-app/core/shared/util';
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
  useCreateHoldingMutation,
  useCreateSecurityMutation,
  useUpdateHoldingMutation,
} from '#securities';

type HoldingEditModalProps = {
  accountId: string;
  holdingId?: string;
};

export function HoldingEditModal({
  accountId,
  holdingId,
}: HoldingEditModalProps) {
  const { t } = useTranslation();

  const { data: holdings = [] } = useQuery(
    securitiesQueries.holdings(accountId),
  );
  const existingHolding = holdingId
    ? holdings.find(h => h.id === holdingId)
    : undefined;

  const [ticker, setTicker] = useState(existingHolding?.ticker ?? '');
  const [name, setName] = useState(existingHolding?.security_name ?? '');
  const [shares, setShares] = useState(
    existingHolding ? String(integerToShares(existingHolding.shares)) : '0',
  );
  const [costBasis, setCostBasis] = useState(
    existingHolding ? String(existingHolding.cost_basis / 100) : '0',
  );
  const [error, setError] = useState<string | null>(null);

  const createSecurity = useCreateSecurityMutation();
  const createHolding = useCreateHoldingMutation();
  const updateHolding = useUpdateHoldingMutation();

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
    const parsedCost = Number(costBasis.trim());
    if (Number.isNaN(parsedShares)) {
      setError(t('Shares must be a number'));
      return;
    }
    if (Number.isNaN(parsedCost)) {
      setError(t('Cost basis must be a number'));
      return;
    }

    try {
      const security = await createSecurity.mutateAsync({
        ticker: trimmedTicker,
        name: name.trim() || null,
      });

      if (holdingId) {
        await updateHolding.mutateAsync({
          id: holdingId,
          security: security.id,
          shares: sharesToInteger(parsedShares),
          cost_basis: amountToInteger(parsedCost),
        });
      } else {
        await createHolding.mutateAsync({
          account: accountId,
          security: security.id,
          shares: sharesToInteger(parsedShares),
          cost_basis: amountToInteger(parsedCost),
        });
      }

      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal name="holding-edit">
      {({ state }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle
                title={holdingId ? t('Edit Holding') : t('Add Holding')}
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
              <InlineField label={t('Shares')} width="100%">
                <Input
                  name="shares"
                  inputMode="decimal"
                  value={shares}
                  onChangeValue={setShares}
                  style={{ flex: 1 }}
                />
              </InlineField>
              <InlineField label={t('Cost basis')} width="100%">
                <Input
                  name="cost_basis"
                  inputMode="decimal"
                  value={costBasis}
                  onChangeValue={setCostBasis}
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
