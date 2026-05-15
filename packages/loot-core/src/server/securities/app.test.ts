// @ts-strict-ignore
import * as db from '#server/db';
import * as monthUtils from '#shared/months';
import { priceToInteger, sharesToInteger } from '#shared/securities';
import { app as accountsApp } from '#server/accounts/app';

import { app } from './app';

beforeEach(global.emptyDatabase());

const createSecurity = app.handlers['security-create'];
const updateSecurity = app.handlers['security-update'];
const deleteSecurity = app.handlers['security-delete'];
const getSecurities = app.handlers['securities-get'];
const createHolding = app.handlers['holding-create'];
const getHoldings = app.handlers['holdings-get'];
const setSecurityPrices = app.handlers['security-prices-set'];
const getSecurityPrices = app.handlers['security-prices-get'];
const getHoldingsValue = app.handlers['holdings-value'];
const createAccount = accountsApp.handlers['account-create'];

describe('Securities', () => {
  test('creating a security dedupes by ticker', async () => {
    const a = await createSecurity({ ticker: 'VTI', name: 'Vanguard Total' });
    const b = await createSecurity({ ticker: 'VTI', name: 'Renamed' });

    expect(b.id).toBe(a.id);
    const all = await getSecurities();
    expect(all.length).toBe(1);
    expect(all[0].name).toBe('Renamed');
  });

  test('updating a security persists changes', async () => {
    const sec = await createSecurity({ ticker: 'AAPL' });
    await updateSecurity({ id: sec.id, name: 'Apple Inc.', type: 'stock' });

    const all = await getSecurities();
    expect(all[0]).toMatchObject({ name: 'Apple Inc.', type: 'stock' });
  });

  test('a security cannot be held twice in the same account', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI' });

    await createHolding({ account: 'acct', security: sec.id, shares: 0 });
    await expect(
      createHolding({ account: 'acct', security: sec.id, shares: 0 }),
    ).rejects.toThrow(/already exists/);
  });

  test('setting prices upserts on (security, date)', async () => {
    const sec = await createSecurity({ ticker: 'VTI' });

    await setSecurityPrices({
      security: sec.id,
      prices: [{ date: '2024-01-02', price: priceToInteger(100) }],
    });
    await setSecurityPrices({
      security: sec.id,
      prices: [{ date: '2024-01-02', price: priceToInteger(123.45) }],
    });

    const prices = await getSecurityPrices({ security: sec.id });
    expect(prices.length).toBe(1);
    expect(prices[0]).toMatchObject({
      date: '2024-01-02',
      price: priceToInteger(123.45),
    });
  });

  test('holdings-get computes market value and gain', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI' });
    await createHolding({
      account: 'acct',
      security: sec.id,
      shares: sharesToInteger(10),
      cost_basis: 80000, // $800.00
    });
    await setSecurityPrices({
      security: sec.id,
      prices: [{ date: monthUtils.currentDay(), price: priceToInteger(100) }],
    });

    const [holding] = await getHoldings({ accountId: 'acct' });
    expect(holding.market_value).toBe(100000); // 10 * $100 = $1000.00
    expect(holding.gain).toBe(20000); // $200.00
    expect(holding.gain_percent).toBeCloseTo(0.25);
  });

  test('holdings-value uses the most recent price on or before each date', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI' });
    await createHolding({
      account: 'acct',
      security: sec.id,
      shares: sharesToInteger(10),
      cost_basis: 0,
    });
    await setSecurityPrices({
      security: sec.id,
      prices: [
        { date: '2024-01-01', price: priceToInteger(50) },
        { date: '2024-06-01', price: priceToInteger(75) },
      ],
    });

    const series = await getHoldingsValue({
      accountId: 'acct',
      dates: ['2023-12-31', '2024-03-01', '2024-07-01'],
    });

    expect(series).toEqual([
      { date: '2023-12-31', value: 0 },
      { date: '2024-03-01', value: 50000 },
      { date: '2024-07-01', value: 75000 },
    ]);
  });

  test('a held security cannot be deleted, an unheld one can', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI' });
    await setSecurityPrices({
      security: sec.id,
      prices: [{ date: '2024-01-01', price: priceToInteger(50) }],
    });
    const holding = await createHolding({
      account: 'acct',
      security: sec.id,
      shares: sharesToInteger(1),
    });

    await expect(deleteSecurity({ id: sec.id })).rejects.toThrow(/still held/);

    await db.deleteHolding({ id: holding.id });
    await deleteSecurity({ id: sec.id });

    expect((await getSecurities()).length).toBe(0);
    expect((await getSecurityPrices({ security: sec.id })).length).toBe(0);
  });
});

describe('Investment accounts', () => {
  test('creating an investment account forces off-budget and adds no starting transaction', async () => {
    const id = await createAccount({
      name: 'Brokerage',
      balance: 5000,
      offBudget: false,
      isInvestment: true,
    });

    const account = await db.getAccount(id);
    expect(account.is_investment).toBe(1);
    expect(account.offbudget).toBe(1);

    const transactions = await db.getTransactions(id);
    expect(transactions.length).toBe(0);
  });

  test('non-investment accounts are unaffected', async () => {
    const id = await createAccount({
      name: 'Checking',
      balance: 5000,
      offBudget: false,
    });

    const account = await db.getAccount(id);
    expect(account.is_investment).toBe(0);
    expect(account.offbudget).toBe(0);

    const transactions = await db.getTransactions(id);
    expect(transactions.length).toBe(1);
  });
});
