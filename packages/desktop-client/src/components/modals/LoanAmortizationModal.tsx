import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { InlineField } from '@actual-app/components/inline-field';
import { Input } from '@actual-app/components/input';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import type { LoanProfileEntity } from '@actual-app/core/types/models';
import type { AmortizationPeriod } from '@actual-app/core/shared/loans';

import { FinancialText } from '#components/FinancialText';
import {
  Modal,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { useAccount } from '#hooks/useAccount';
import type { Modal as ModalType } from '#modals/modalsSlice';

type LoanAmortizationViewModalProps = Extract<
  ModalType,
  { name: 'loan-amortization-view' }
>['options'];

function centsToDisplay(cents: number): string {
  return (cents / 100).toFixed(2);
}

function bpsToAprDisplay(bps: number): string {
  return (bps / 100).toFixed(3);
}

export function LoanAmortizationModal({
  accountId,
}: LoanAmortizationViewModalProps) {
  const { t } = useTranslation();
  const account = useAccount(accountId);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<LoanProfileEntity | null>(null);
  const [schedule, setSchedule] = useState<AmortizationPeriod[]>([]);
  const [remainingBalance, setRemainingBalance] = useState<number | null>(null);
  const [projectedPayoff, setProjectedPayoff] = useState<string | null>(null);

  // What-if: extra payment
  const [extraPayment, setExtraPayment] = useState('');
  const [whatIfPayoff, setWhatIfPayoff] = useState<string | null>(null);
  const [whatIfInterestSaved, setWhatIfInterestSaved] = useState<number | null>(
    null,
  );

  useEffect(() => {
    async function load() {
      const p: LoanProfileEntity | null = await send('loan-profile-get', {
        accountId,
      });
      if (!p) {
        setLoading(false);
        return;
      }
      setProfile(p);

      const sched: AmortizationPeriod[] = await send(
        'loan-amortization-schedule',
        { accountId },
      );
      setSchedule(sched);

      const balance: number = await send('loan-remaining-balance', {
        accountId,
        payments: [],
      });
      setRemainingBalance(balance);

      const payoff: string | null = await send('loan-projected-payoff', {
        accountId,
        payments: [],
      });
      setProjectedPayoff(payoff);

      setLoading(false);
    }
    void load();
  }, [accountId]);

  async function handleWhatIf() {
    if (!profile || !schedule.length) return;
    const extra = parseFloat(extraPayment.replace(/,/g, ''));
    if (isNaN(extra) || extra <= 0) return;

    const extraCents = Math.round(extra * 100);

    // Simulate projected payoff with modified payment
    const modifiedPayment = profile.payment_amount + extraCents;
    let balance = profile.original_principal;
    const r =
      profile.interest_rate === 0
        ? 0
        : profile.interest_rate / 10000 / 12;

    const [baseYear, baseMonth, baseDay] = profile.origination_date
      .split('-')
      .map(Number);

    let newPayoffDate: string | null = null;
    let newTotalInterest = 0;

    for (let i = 0; i < profile.term_months * 2; i++) {
      if (balance <= 0) break;
      const interest = Math.round(balance * r);
      const principal = Math.min(modifiedPayment - interest, balance);
      newTotalInterest += interest;
      balance -= principal;
      if (balance <= 0) {
        const totalMonths = baseMonth - 1 + i;
        const year = baseYear + Math.floor(totalMonths / 12);
        const month = (totalMonths % 12) + 1;
        newPayoffDate = `${year}-${String(month).padStart(2, '0')}-${String(baseDay).padStart(2, '0')}`;
        break;
      }
    }

    const originalTotalInterest = schedule.reduce(
      (sum, row) => sum + row.interest,
      0,
    );
    const interestSaved = originalTotalInterest - newTotalInterest;

    setWhatIfPayoff(newPayoffDate);
    setWhatIfInterestSaved(interestSaved);
  }

  const totalInterest = schedule.reduce((sum, row) => sum + row.interest, 0);

  return (
    <Modal
      name="loan-amortization-view"
      isLoading={loading}
      containerProps={{ style: { width: '70vw', maxWidth: 900 } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle
                title={
                  account
                    ? t('Amortization schedule — {{name}}', {
                        name: account.name,
                      })
                    : t('Amortization schedule')
                }
                shrinkOnOverflow
              />
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />

          {!profile ? (
            <View style={{ padding: 20 }}>
              <Text style={{ color: theme.pageTextSubdued }}>
                <Trans>
                  No loan profile configured for this account. Use "Manage loan"
                  to set one up.
                </Trans>
              </Text>
            </View>
          ) : (
            <View style={{ padding: '0 16px 16px' }}>
              {/* Loan summary */}
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 16,
                  marginBottom: 16,
                  padding: 12,
                  background: theme.tableBackground,
                  borderRadius: 6,
                  border: `1px solid ${theme.tableBorder}`,
                }}
              >
                <SummaryItem
                  label={t('Original principal')}
                  value={
                    <FinancialText>
                      ${centsToDisplay(profile.original_principal)}
                    </FinancialText>
                  }
                />
                <SummaryItem
                  label={t('Interest rate')}
                  value={
                    <FinancialText>
                      {bpsToAprDisplay(profile.interest_rate)}%
                    </FinancialText>
                  }
                />
                <SummaryItem
                  label={t('Term')}
                  value={
                    <Text>
                      {profile.term_months}{' '}
                      <Trans>months</Trans>
                    </Text>
                  }
                />
                <SummaryItem
                  label={t('Monthly payment')}
                  value={
                    <FinancialText>
                      ${centsToDisplay(profile.payment_amount)}
                    </FinancialText>
                  }
                />
                {profile.escrow_amount > 0 && (
                  <SummaryItem
                    label={t('Monthly escrow')}
                    value={
                      <FinancialText>
                        ${centsToDisplay(profile.escrow_amount)}
                      </FinancialText>
                    }
                  />
                )}
                <SummaryItem
                  label={t('Total interest')}
                  value={
                    <FinancialText>
                      ${centsToDisplay(totalInterest)}
                    </FinancialText>
                  }
                />
                {remainingBalance !== null && (
                  <SummaryItem
                    label={t('Remaining balance')}
                    value={
                      <FinancialText>
                        ${centsToDisplay(remainingBalance)}
                      </FinancialText>
                    }
                  />
                )}
                {projectedPayoff && (
                  <SummaryItem
                    label={t('Projected payoff')}
                    value={<Text>{projectedPayoff}</Text>}
                  />
                )}
              </View>

              {/* What-if helper */}
              <View
                style={{
                  marginBottom: 16,
                  padding: 12,
                  background: theme.tableBackground,
                  borderRadius: 6,
                  border: `1px solid ${theme.tableBorder}`,
                }}
              >
                <Text
                  style={{
                    fontWeight: 600,
                    marginBottom: 8,
                    color: theme.pageText,
                  }}
                >
                  <Trans>Extra payment what-if</Trans>
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <InlineField
                    label={t('Extra monthly payment ($)')}
                    width="auto"
                  >
                    <Input
                      inputMode="decimal"
                      value={extraPayment}
                      onChangeValue={setExtraPayment}
                      style={{ width: 120 }}
                    />
                  </InlineField>
                  <Button
                    type="button"
                    variant="primary"
                    onPress={handleWhatIf}
                    style={{ marginTop: 2 }}
                  >
                    <Trans>Calculate</Trans>
                  </Button>
                </View>
                {whatIfPayoff && (
                  <View style={{ marginTop: 8, gap: 4 }}>
                    <Text style={{ color: theme.pageText }}>
                      <Trans>New projected payoff:</Trans>{' '}
                      <Text style={{ fontWeight: 600 }}>{whatIfPayoff}</Text>
                    </Text>
                    {whatIfInterestSaved !== null && whatIfInterestSaved > 0 && (
                      <Text style={{ color: theme.pageText }}>
                        <Trans>Interest saved:</Trans>{' '}
                        <FinancialText style={{ fontWeight: 600 }}>
                          ${centsToDisplay(whatIfInterestSaved)}
                        </FinancialText>
                      </Text>
                    )}
                  </View>
                )}
              </View>

              {/* Amortization table */}
              <View
                style={{
                  overflow: 'auto',
                  maxHeight: '40vh',
                  border: `1px solid ${theme.tableBorder}`,
                  borderRadius: 6,
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: theme.tableBackground,
                        position: 'sticky',
                        top: 0,
                        zIndex: 1,
                      }}
                    >
                      {[
                        t('#'),
                        t('Date'),
                        t('Payment'),
                        t('Principal'),
                        t('Interest'),
                        t('Balance'),
                      ].map(header => (
                        <th
                          key={header}
                          style={{
                            padding: '6px 10px',
                            textAlign: header === t('#') ? 'center' : 'right',
                            borderBottom: `1px solid ${theme.tableBorder}`,
                            color: theme.pageTextSubdued,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map(row => (
                      <tr
                        key={row.period}
                        style={{
                          borderBottom: `1px solid ${theme.tableBorder}`,
                        }}
                      >
                        <td
                          style={{
                            padding: '5px 10px',
                            textAlign: 'center',
                            color: theme.pageTextSubdued,
                            ...styles.tnum,
                          }}
                        >
                          {row.period}
                        </td>
                        <td
                          style={{
                            padding: '5px 10px',
                            textAlign: 'right',
                            ...styles.tnum,
                          }}
                        >
                          {row.date}
                        </td>
                        <td
                          style={{
                            padding: '5px 10px',
                            textAlign: 'right',
                            ...styles.tnum,
                          }}
                        >
                          ${centsToDisplay(row.payment)}
                        </td>
                        <td
                          style={{
                            padding: '5px 10px',
                            textAlign: 'right',
                            ...styles.tnum,
                          }}
                        >
                          ${centsToDisplay(row.principal)}
                        </td>
                        <td
                          style={{
                            padding: '5px 10px',
                            textAlign: 'right',
                            ...styles.tnum,
                          }}
                        >
                          ${centsToDisplay(row.interest)}
                        </td>
                        <td
                          style={{
                            padding: '5px 10px',
                            textAlign: 'right',
                            ...styles.tnum,
                          }}
                        >
                          ${centsToDisplay(row.closing_balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  marginTop: 12,
                }}
              >
                <Button onPress={() => state.close()}>
                  <Trans>Close</Trans>
                </Button>
              </View>
            </View>
          )}
        </>
      )}
    </Modal>
  );
}

type SummaryItemProps = {
  label: string;
  value: ReactNode;
};

function SummaryItem({ label, value }: SummaryItemProps) {
  return (
    <View style={{ flexDirection: 'column', minWidth: 120 }}>
      <Text
        style={{
          fontSize: 11,
          color: theme.pageTextSubdued,
          marginBottom: 2,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </Text>
      <View style={{ fontSize: 14, fontWeight: 500 }}>{value}</View>
    </View>
  );
}
