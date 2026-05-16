import { createApp } from '#server/app';
import * as db from '#server/db';
import { mutator } from '#server/mutators';
import { batchMessages } from '#server/sync';
import { undoable } from '#server/undo';
import * as monthUtils from '#shared/months';
import {
  computeHoldings,
  holdingGain,
  holdingMarketValue,
} from '#shared/securities';
import type {
  HoldingEntity,
  InvestmentTransactionEntity,
  SecurityEntity,
  SecurityPriceEntity,
} from '#types/models';

export type HoldingView = HoldingEntity & {
  ticker: SecurityEntity['ticker'];
  security_name: SecurityEntity['name'];
  price: number;
  market_value: number;
  gain: number;
  gain_percent: number | null;
};

export type InvestmentTransactionView = InvestmentTransactionEntity & {
  ticker: SecurityEntity['ticker'];
  security_name: SecurityEntity['name'];
};

export type SecuritiesHandlers = {
  'securities-get': typeof getSecurities;
  'security-create': typeof createSecurity;
  'security-update': typeof updateSecurity;
  'security-delete': typeof deleteSecurity;
  'holdings-get': typeof getHoldings;
  'holdings-value': typeof getHoldingsValue;
  'investment-transactions-get': typeof getInvestmentTransactions;
  'investment-transaction-create': typeof createInvestmentTransaction;
  'investment-transaction-update': typeof updateInvestmentTransaction;
  'investment-transaction-delete': typeof deleteInvestmentTransaction;
  'security-prices-get': typeof getSecurityPrices;
  'security-prices-set': typeof setSecurityPrices;
};

export const app = createApp<SecuritiesHandlers>();
app.method('securities-get', getSecurities);
app.method('security-create', mutator(undoable(createSecurity)));
app.method('security-update', mutator(undoable(updateSecurity)));
app.method('security-delete', mutator(undoable(deleteSecurity)));
app.method('holdings-get', getHoldings);
app.method('holdings-value', getHoldingsValue);
app.method('investment-transactions-get', getInvestmentTransactions);
app.method(
  'investment-transaction-create',
  mutator(undoable(createInvestmentTransaction)),
);
app.method(
  'investment-transaction-update',
  mutator(undoable(updateInvestmentTransaction)),
);
app.method(
  'investment-transaction-delete',
  mutator(undoable(deleteInvestmentTransaction)),
);
app.method('security-prices-get', getSecurityPrices);
app.method('security-prices-set', mutator(undoable(setSecurityPrices)));

async function getSecurities(): Promise<SecurityEntity[]> {
  const securities = await db.getSecurities();
  return securities.map(s => ({
    id: s.id,
    ticker: s.ticker,
    name: s.name ?? null,
    type: s.type ?? null,
    sort_order: s.sort_order,
  }));
}

async function createSecurity({
  ticker,
  name = null,
  type = null,
}: Omit<SecurityEntity, 'id' | 'sort_order'>): Promise<SecurityEntity> {
  const trimmedTicker = ticker.trim();
  if (!trimmedTicker) {
    throw new Error('Security ticker is required');
  }

  const existing = await db.getSecurityByTicker(trimmedTicker);
  if (existing) {
    await db.updateSecurity({ id: existing.id, name, type, tombstone: 0 });
    return { id: existing.id, ticker: existing.ticker, name, type };
  }

  const id = await db.insertSecurity({
    ticker: trimmedTicker,
    name: name ? name.trim() : null,
    type,
  });
  return { id, ticker: trimmedTicker, name, type };
}

async function updateSecurity(
  security: Partial<SecurityEntity> & Pick<SecurityEntity, 'id'>,
): Promise<Partial<SecurityEntity>> {
  await db.updateSecurity(security);
  return security;
}

async function deleteSecurity({
  id,
}: Pick<SecurityEntity, 'id'>): Promise<SecurityEntity['id']> {
  const transactions = await db.getAllInvestmentTransactions();
  if (transactions.some(t => t.security === id)) {
    throw new Error(
      'Cannot delete a security that has investment transactions',
    );
  }

  await batchMessages(async () => {
    const prices = await db.getSecurityPrices(id);
    for (const price of prices) {
      await db.deleteSecurityPrice({ id: price.id });
    }
    await db.deleteSecurity({ id });
  });
  return id;
}

async function getHoldings({
  accountId,
}: {
  accountId: HoldingEntity['account'];
}): Promise<HoldingView[]> {
  const transactions = await db.getInvestmentTransactions(accountId);
  const holdings = computeHoldings(
    transactions.map(t => ({
      security: t.security,
      type: t.type,
      shares: t.shares,
      price: t.price,
    })),
  );
  const today = db.toDateRepr(monthUtils.currentDay());

  return Promise.all(
    holdings.map(async holding => {
      const security = await db.getSecurity(holding.security);
      const priceRow = await db.getSecurityPriceAsOf(holding.security, today);
      const price = priceRow?.price ?? 0;
      const marketValue = holdingMarketValue(holding.shares, price);
      const { gain, gainPercent } = holdingGain(
        marketValue,
        holding.cost_basis,
      );

      return {
        id: `${accountId}:${holding.security}`,
        account: accountId,
        security: holding.security,
        shares: holding.shares,
        cost_basis: holding.cost_basis,
        ticker: security?.ticker ?? '',
        security_name: security?.name ?? null,
        price,
        market_value: marketValue,
        gain,
        gain_percent: gainPercent,
      };
    }),
  );
}

async function getHoldingsValue({
  accountId,
  dates,
}: {
  accountId: HoldingEntity['account'];
  dates: string[];
}): Promise<Array<{ date: string; value: number }>> {
  const transactions = await db.getInvestmentTransactions(accountId);

  return Promise.all(
    dates.map(async date => {
      const dateInt = db.toDateRepr(date);
      const holdings = computeHoldings(
        transactions
          .filter(t => t.date <= dateInt)
          .map(t => ({
            security: t.security,
            type: t.type,
            shares: t.shares,
            price: t.price,
          })),
      );

      let value = 0;
      for (const holding of holdings) {
        const priceRow = await db.getSecurityPriceAsOf(
          holding.security,
          dateInt,
        );
        value += holdingMarketValue(holding.shares, priceRow?.price ?? 0);
      }
      return { date, value };
    }),
  );
}

async function getInvestmentTransactions({
  accountId,
}: {
  accountId: InvestmentTransactionEntity['account'];
}): Promise<InvestmentTransactionView[]> {
  const transactions = await db.getInvestmentTransactions(accountId);

  return Promise.all(
    transactions.map(async t => {
      const security = await db.getSecurity(t.security);
      return {
        id: t.id,
        account: t.account,
        security: t.security,
        date: db.fromDateRepr(t.date),
        type: t.type,
        shares: t.shares,
        price: t.price,
        ticker: security?.ticker ?? '',
        security_name: security?.name ?? null,
      };
    }),
  );
}

async function createInvestmentTransaction({
  account,
  security,
  date,
  type,
  shares,
  price,
}: Omit<
  InvestmentTransactionEntity,
  'id'
>): Promise<InvestmentTransactionEntity> {
  if (type !== 'buy' && type !== 'sell') {
    throw new Error('Investment transaction type must be "buy" or "sell"');
  }
  if (!Number.isFinite(shares) || shares <= 0) {
    throw new Error('Shares must be a positive number');
  }
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Price must be a non-negative number');
  }

  const id = await db.insertInvestmentTransaction({
    account,
    security,
    date: db.toDateRepr(date),
    type,
    shares,
    price,
  });
  return { id, account, security, date, type, shares, price };
}

async function updateInvestmentTransaction(
  transaction: Partial<Omit<InvestmentTransactionEntity, 'id'>> &
    Pick<InvestmentTransactionEntity, 'id'>,
): Promise<Partial<InvestmentTransactionEntity>> {
  if (
    transaction.type != null &&
    transaction.type !== 'buy' &&
    transaction.type !== 'sell'
  ) {
    throw new Error('Investment transaction type must be "buy" or "sell"');
  }

  const { date, ...rest } = transaction;
  await db.updateInvestmentTransaction({
    ...rest,
    ...(date != null ? { date: db.toDateRepr(date) } : {}),
  });
  return transaction;
}

async function deleteInvestmentTransaction({
  id,
}: Pick<InvestmentTransactionEntity, 'id'>): Promise<
  InvestmentTransactionEntity['id']
> {
  await db.deleteInvestmentTransaction({ id });
  return id;
}

async function getSecurityPrices({
  security,
}: {
  security: SecurityPriceEntity['security'];
}): Promise<SecurityPriceEntity[]> {
  const prices = await db.getSecurityPrices(security);
  return prices.map(p => ({
    id: p.id,
    security: p.security,
    date: db.fromDateRepr(p.date),
    price: p.price,
  }));
}

async function setSecurityPrices({
  security,
  prices,
}: {
  security: SecurityPriceEntity['security'];
  prices: Array<Pick<SecurityPriceEntity, 'date' | 'price'>>;
}): Promise<{ upserted: number }> {
  let upserted = 0;
  await batchMessages(async () => {
    for (const { date, price } of prices) {
      const dateInt = db.toDateRepr(date);
      const existing = await db.getSecurityPriceOn(security, dateInt);
      if (existing) {
        await db.updateSecurityPrice({ id: existing.id, price, tombstone: 0 });
      } else {
        await db.insertSecurityPrice({ security, date: dateInt, price });
      }
      upserted++;
    }
  });
  return { upserted };
}
