import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Form } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { FormError } from '@actual-app/components/form-error';
import { InlineField } from '@actual-app/components/inline-field';
import { Input } from '@actual-app/components/input';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import type { LoanProfileEntity } from '@actual-app/core/types/models';

import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { useAccount } from '#hooks/useAccount';
import type { Modal as ModalType } from '#modals/modalsSlice';

type LoanProfileEditModalProps = Extract<
  ModalType,
  { name: 'loan-profile-edit' }
>['options'];

function centsToDisplayDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function displayDollarsToCents(str: string): number {
  const n = parseFloat(str.replace(/,/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

function bpsToAprDisplay(bps: number): string {
  return (bps / 100).toFixed(3);
}

function aprDisplayToBps(str: string): number {
  const n = parseFloat(str);
  return isNaN(n) ? 0 : Math.round(n * 100);
}

export function LoanProfileEditModal({ accountId }: LoanProfileEditModalProps) {
  const { t } = useTranslation();
  const account = useAccount(accountId);

  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<LoanProfileEntity | null>(null);

  const [principal, setPrincipal] = useState('');
  const [apr, setApr] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [originationDate, setOriginationDate] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [escrow, setEscrow] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const profile = await send('loan-profile-get', { accountId });
      if (profile) {
        setExisting(profile);
        setPrincipal(centsToDisplayDollars(profile.original_principal));
        setApr(bpsToAprDisplay(profile.interest_rate));
        setTermMonths(String(profile.term_months));
        setOriginationDate(profile.origination_date);
        setPaymentAmount(centsToDisplayDollars(profile.payment_amount));
        setEscrow(
          profile.escrow_amount > 0
            ? centsToDisplayDollars(profile.escrow_amount)
            : '',
        );
      }
      setLoading(false);
    }
    void load();
  }, [accountId]);

  async function handleCalculatePayment() {
    const p = displayDollarsToCents(principal);
    const r = aprDisplayToBps(apr);
    const tm = parseInt(termMonths, 10);
    if (p <= 0 || r < 0 || tm <= 0) return;
    const computed: number = await send('loan-compute-payment', {
      principal: p,
      annualRateBps: r,
      termMonths: tm,
    });
    setPaymentAmount(centsToDisplayDollars(computed));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    const p = displayDollarsToCents(principal);
    const r = aprDisplayToBps(apr);
    const tm = parseInt(termMonths, 10);
    const pa = displayDollarsToCents(paymentAmount);

    if (!principal || p <= 0) {
      next.principal = t('Principal must be a positive amount');
    }
    if (!apr || r < 0) {
      next.apr = t('Interest rate must be 0 or greater');
    }
    if (!termMonths || isNaN(tm) || tm <= 0) {
      next.termMonths = t('Term must be a positive number of months');
    }
    if (!originationDate || !/^\d{4}-\d{2}-\d{2}$/.test(originationDate)) {
      next.originationDate = t('Enter a valid date (YYYY-MM-DD)');
    }
    if (!paymentAmount || pa <= 0) {
      next.paymentAmount = t('Payment must be a positive amount');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    await send('loan-profile-set', {
      account: accountId,
      original_principal: displayDollarsToCents(principal),
      interest_rate: aprDisplayToBps(apr),
      term_months: parseInt(termMonths, 10),
      origination_date: originationDate,
      payment_amount: displayDollarsToCents(paymentAmount),
      escrow_amount: escrow ? displayDollarsToCents(escrow) : 0,
    });
    setSaving(false);
  }

  async function onDelete(close: () => void) {
    setDeleting(true);
    await send('loan-profile-delete', { accountId });
    setDeleting(false);
    close();
  }

  return (
    <Modal
      name="loan-profile-edit"
      isLoading={loading}
      containerProps={{ style: { width: '35vw', minWidth: 340 } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle
                title={
                  account
                    ? t('Loan settings — {{name}}', { name: account.name })
                    : t('Loan settings')
                }
                shrinkOnOverflow
              />
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View>
            <Form
              onSubmit={async e => {
                await onSubmit(e);
                state.close();
              }}
            >
              <InlineField label={t('Original principal ($)')} width="100%">
                <Input
                  name="principal"
                  inputMode="decimal"
                  value={principal}
                  onChangeValue={setPrincipal}
                  style={{ flex: 1 }}
                />
              </InlineField>
              {errors.principal && (
                <FormError style={{ marginLeft: 75 }}>
                  {errors.principal}
                </FormError>
              )}

              <InlineField label={t('Interest rate (APR %)')} width="100%">
                <Input
                  name="apr"
                  inputMode="decimal"
                  value={apr}
                  onChangeValue={setApr}
                  style={{ flex: 1 }}
                />
              </InlineField>
              {errors.apr && (
                <FormError style={{ marginLeft: 75 }}>{errors.apr}</FormError>
              )}

              <InlineField label={t('Term (months)')} width="100%">
                <Input
                  name="termMonths"
                  inputMode="numeric"
                  value={termMonths}
                  onChangeValue={setTermMonths}
                  style={{ flex: 1 }}
                />
              </InlineField>
              {errors.termMonths && (
                <FormError style={{ marginLeft: 75 }}>
                  {errors.termMonths}
                </FormError>
              )}

              <InlineField label={t('Origination date')} width="100%">
                <Input
                  name="originationDate"
                  placeholder="YYYY-MM-DD"
                  value={originationDate}
                  onChangeValue={setOriginationDate}
                  style={{ flex: 1 }}
                />
              </InlineField>
              {errors.originationDate && (
                <FormError style={{ marginLeft: 75 }}>
                  {errors.originationDate}
                </FormError>
              )}

              <InlineField label={t('Monthly payment ($)')} width="100%">
                <Input
                  name="paymentAmount"
                  inputMode="decimal"
                  value={paymentAmount}
                  onChangeValue={setPaymentAmount}
                  style={{ flex: 1 }}
                />
              </InlineField>
              {errors.paymentAmount && (
                <FormError style={{ marginLeft: 75 }}>
                  {errors.paymentAmount}
                </FormError>
              )}

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  marginBottom: 10,
                }}
              >
                <Button
                  type="button"
                  variant="bare"
                  style={{ fontSize: 12, color: theme.pageTextLink }}
                  onPress={handleCalculatePayment}
                >
                  <Trans>Calculate payment from principal/rate/term</Trans>
                </Button>
              </View>

              <InlineField
                label={t('Monthly escrow ($)')}
                width="100%"
              >
                <Input
                  name="escrow"
                  inputMode="decimal"
                  value={escrow}
                  onChangeValue={setEscrow}
                  placeholder={t('0.00 (optional)')}
                  style={{ flex: 1 }}
                />
              </InlineField>

              <ModalButtons>
                {existing && (
                  <Button
                    type="button"
                    variant="bare"
                    style={{ color: theme.errorText, marginRight: 'auto' }}
                    isDisabled={deleting}
                    onPress={() => onDelete(state.close)}
                  >
                    <Trans>Remove loan profile</Trans>
                  </Button>
                )}
                <Button type="button" onPress={() => state.close()}>
                  <Trans>Cancel</Trans>
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  style={{ marginLeft: 10 }}
                  isDisabled={saving}
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
