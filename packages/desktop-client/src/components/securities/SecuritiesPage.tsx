import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { FormError } from '@actual-app/components/form-error';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { priceToInteger, integerToPrice } from '@actual-app/core/shared/securities';
import type { SecurityEntity, SecurityPriceEntity } from '@actual-app/core/types/models';
import { useQuery } from '@tanstack/react-query';
import { css } from '@emotion/css';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Page } from '#components/Page';
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

type PriceTooltipProps = {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
};

function PriceTooltip({ active, payload, label }: PriceTooltipProps) {
  const { t } = useTranslation();

  if (!active || !payload?.length) return null;

  return (
    <div
      className={css({
        zIndex: 1000,
        pointerEvents: 'none',
        borderRadius: 4,
        boxShadow: '0 1px 6px rgba(0,0,0,.20)',
        backgroundColor: theme.menuBackground,
        color: theme.menuItemText,
        padding: 10,
        fontSize: 13,
      })}
    >
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div>
        {t('Price')}: ${payload[0].value.toFixed(4)}
      </div>
    </div>
  );
}

type PriceChartProps = {
  prices: SecurityPriceEntity[];
};

function PriceChart({ prices }: PriceChartProps) {
  if (prices.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.tableTextLight,
          padding: 40,
        }}
      >
        <Text>
          <Trans>
            No price history available. Import prices via CSV to see history.
          </Trans>
        </Text>
      </View>
    );
  }

  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const chartData = sorted.map(p => ({
    date: p.date,
    price: integerToPrice(p.price),
  }));

  const allPrices = chartData.map(d => d.price);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const padding = (maxPrice - minPrice) * 0.05 || 1;

  return (
    <View style={{ flex: 1, minHeight: 300 }}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 20, left: 10, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={theme.tableBorder} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: theme.tableTextLight }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minPrice - padding, maxPrice + padding]}
            tick={{ fontSize: 11, fill: theme.tableTextLight }}
            tickLine={false}
            tickFormatter={v => `$${Number(v).toFixed(2)}`}
            width={70}
          />
          <Tooltip content={<PriceTooltip />} />
          <Line
            type="monotone"
            dataKey="price"
            stroke="var(--color-chartQual1, #0ea5e9)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </View>
  );
}

type SecurityDetailProps = {
  security: SecurityEntity;
};

function SecurityDetail({ security }: SecurityDetailProps) {
  const { t } = useTranslation();
  const { data: prices = [] } = useQuery(securitiesQueries.prices(security.id));
  const setPrices = useSetSecurityPricesMutation();
  const deleteSecurity = useDeleteSecurityMutation();
  const [error, setError] = useState<string | null>(null);

  const sortedPrices = [...prices].sort((a, b) => b.date.localeCompare(a.date));
  const latestPrice = sortedPrices[0];

  const onImportFile = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const parsed = parsePriceCsv(text);
      if (parsed.length === 0) {
        setError(t('No valid prices found in file'));
        return;
      }
      setPrices.mutate({ security: security.id, prices: parsed });
    };
    reader.onerror = () => setError(t('Could not read the file'));
    reader.readAsText(file);
  };

  const onDelete = () => {
    setError(null);
    deleteSecurity.mutate(
      { id: security.id },
      { onError: e => setError(e instanceof Error ? e.message : String(e)) },
    );
  };

  return (
    <View style={{ flex: 1, padding: '0 20px 20px' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          padding: '16px 0',
          borderBottom: `1px solid ${theme.tableBorder}`,
          marginBottom: 16,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 20, fontWeight: 600 }}>
            {security.ticker}
          </Text>
          {security.name && (
            <Text style={{ fontSize: 14, color: theme.tableTextLight }}>
              {security.name}
            </Text>
          )}
          {security.type && (
            <Text style={{ fontSize: 12, color: theme.tableTextLight }}>
              <Trans>Type:</Trans> {security.type}
            </Text>
          )}
        </View>
        {latestPrice && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 24, fontWeight: 600 }}>
              ${integerToPrice(latestPrice.price).toFixed(4)}
            </Text>
            <Text style={{ fontSize: 12, color: theme.tableTextLight }}>
              <Trans>as of</Trans> {latestPrice.date}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <label
            className={css({
              fontSize: 13,
              color: theme.pageTextLink,
              cursor: 'pointer',
              padding: '6px 10px',
              borderRadius: 4,
              '&:hover': { backgroundColor: theme.tableRowBackgroundHover },
            })}
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
        </View>
      </View>
      {error && <FormError style={{ marginBottom: 12 }}>{error}</FormError>}
      <Text
        style={{
          fontSize: 15,
          fontWeight: 600,
          marginBottom: 12,
          color: theme.tableText,
        }}
      >
        <Trans>Price history</Trans>
      </Text>
      <PriceChart prices={prices} />
      {prices.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: theme.tableHeaderText,
              marginBottom: 8,
            }}
          >
            <Trans>Recent prices</Trans>
          </Text>
          <View
            style={{
              border: `1px solid ${theme.tableBorder}`,
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: theme.tableHeaderBackground,
                padding: '6px 12px',
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontWeight: 600,
                  color: theme.tableHeaderText,
                }}
              >
                <Trans>Date</Trans>
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: theme.tableHeaderText,
                }}
              >
                <Trans>Price</Trans>
              </Text>
            </View>
            {sortedPrices.slice(0, 10).map(p => (
              <View
                key={p.id}
                style={{
                  flexDirection: 'row',
                  padding: '5px 12px',
                  borderTop: `1px solid ${theme.tableBorder}`,
                }}
              >
                <Text style={{ flex: 1, fontSize: 13, color: theme.tableText }}>
                  {p.date}
                </Text>
                <Text style={{ fontSize: 13, color: theme.tableText }}>
                  ${integerToPrice(p.price).toFixed(4)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export function SecuritiesPage() {
  const { t } = useTranslation();
  const { data: securities = [] } = useQuery(securitiesQueries.list());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected =
    selectedId != null
      ? (securities.find(s => s.id === selectedId) ?? null)
      : null;

  const effectiveSelected = selected ?? securities[0] ?? null;

  return (
    <Page header={t('Securities')}>
      <View style={{ flexDirection: 'row', flex: 1, gap: 0 }}>
        <View
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: `1px solid ${theme.tableBorder}`,
            overflowY: 'auto',
          }}
        >
          {securities.length === 0 ? (
            <View style={{ padding: 16, color: theme.tableTextLight }}>
              <Text style={{ fontSize: 13 }}>
                <Trans>
                  No securities yet. Add an investment account and create
                  holdings to get started.
                </Trans>
              </Text>
            </View>
          ) : (
            securities.map(security => (
              <button
                key={security.id}
                onClick={() => setSelectedId(security.id)}
                className={css({
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  border: 'none',
                  borderBottom: `1px solid ${theme.tableBorder}`,
                  backgroundColor:
                    effectiveSelected?.id === security.id
                      ? theme.tableRowBackgroundHighlight
                      : 'transparent',
                  color: theme.tableText,
                  textAlign: 'left',
                  width: '100%',
                  '&:hover': {
                    backgroundColor: theme.tableRowBackgroundHover,
                  },
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: 600 }}>
                  {security.ticker}
                </Text>
                {security.name && (
                  <Text
                    style={{ fontSize: 12, color: theme.tableTextLight }}
                  >
                    {security.name}
                  </Text>
                )}
              </button>
            ))
          )}
        </View>

        {effectiveSelected ? (
          <SecurityDetail
            key={effectiveSelected.id}
            security={effectiveSelected}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.tableTextLight,
            }}
          >
            <Text>
              <Trans>Select a security to view price history</Trans>
            </Text>
          </View>
        )}
      </View>
    </Page>
  );
}
