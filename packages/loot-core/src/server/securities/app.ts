import { createApp } from '#server/app';
import * as db from '#server/db';
import { mutator } from '#server/mutators';
import { batchMessages } from '#server/sync';
import { undoable } from '#server/undo';
import * as monthUtils from '#shared/months';
import { holdingGain, holdingMarketValue } from '#shared/securities';
import type {
  HoldingEntity,
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

export type SecuritiesHandlers = {
  'securities-get': typeof getSecurities;
  'security-create': typeof createSecurity;
  'security-update': typeof updateSecurity;
  'security-delete': typeof deleteSecurity;
  'holdings-get': typeof getHoldings;
  'holding-create': typeof createHolding;
  'holding-update': typeof updateHolding;
  'holding-delete': typeof deleteHolding;
  'security-prices-get': typeof getSecurityPrices;
  'security-prices-set': typeof setSecurityPrices;
  'holdings-value': typeof getHoldingsValue;
};

export const app = createApp<SecuritiesHandlers>();
app.method('securities-get', getSecurities);
app.method('security-create', mutator(undoable(createSecurity)));
app.method('security-update', mutator(undoable(updateSecurity)));
app.method('security-delete', mutator(undoable(deleteSecurity)));
app.method('holdings-get', getHoldings);
app.method('holding-create', mutator(undoable(createHolding)));
app.method('holding-update', mutator(undoable(updateHolding)));
app.method('holding-delete', mutator(undoable(deleteHolding)));
app.method('security-prices-get', getSecurityPrices);
app.method('security-prices-set', mutator(undoable(setSecurityPrices)));
app.method('holdings-value', getHoldingsValue);

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
  const holdings = await db.getAllHoldings();
  if (holdings.some(h => h.security === id)) {
    throw new Error(
      'Cannot delete a security that is still held in an account',
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
  const holdings = await db.getHoldings(accountId);
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
        id: holding.id,
        account: holding.account,
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

async function createHolding({
  account,
  security,
  shares = 0,
  cost_basis = 0,
}: Pick<HoldingEntity, 'account' | 'security'> &
  Partial<
    Pick<HoldingEntity, 'shares' | 'cost_basis'>
  >): Promise<HoldingEntity> {
  const existing = await db.getHoldingByAccountSecurity(account, security);
  if (existing) {
    throw new Error(
      'A holding for this security already exists in this account',
    );
  }

  const id = await db.insertHolding({ account, security, shares, cost_basis });
  return { id, account, security, shares, cost_basis };
}

async function updateHolding(
  holding: Partial<HoldingEntity> & Pick<HoldingEntity, 'id'>,
): Promise<Partial<HoldingEntity>> {
  await db.updateHolding(holding);
  return holding;
}

async function deleteHolding({
  id,
}: Pick<HoldingEntity, 'id'>): Promise<HoldingEntity['id']> {
  await db.deleteHolding({ id });
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

async function getHoldingsValue({
  accountId,
  dates,
}: {
  accountId: HoldingEntity['account'];
  dates: string[];
}): Promise<Array<{ date: string; value: number }>> {
  const holdings = await db.getHoldings(accountId);

  return Promise.all(
    dates.map(async date => {
      const dateInt = db.toDateRepr(date);
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
