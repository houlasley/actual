// @ts-strict-ignore
import { app as accountsApp } from '#server/accounts/app';
import * as db from '#server/db';
import * as monthUtils from '#shared/months';
import { priceToInteger, sharesToInteger } from '#shared/securities';

import { app } from './app';

beforeEach(global.emptyDatabase());

const createSecurity = app.handlers['security-create'];
const updateSecurity = app.handlers['security-update'];
const deleteSecurity = app.handlers['security-delete'];
const getSecurities = app.handlers['securities-get'];
const getHoldings = app.handlers['holdings-get'];
const getHoldingsValue = app.handlers['holdings-value'];
const createInvestmentTransaction =
  app.handlers['investment-transaction-create'];
const updateInvestmentTransaction =
  app.handlers['investment-transaction-update'];
const deleteInvestmentTransaction =
  app.handlers['investment-transaction-delete'];
const getInvestmentTransactions = app.handlers['investment-transactions-get'];
const setSecurityPrices = app.handlers['security-prices-set'];
const getSecurityPrices = app.handlers['security-prices-get'];
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

  test('a security with investment transactions cannot be deleted', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI' });
    const txn = await createInvestmentTransaction({
      account: 'acct',
      security: sec.id,
      date: '2024-01-01',
      type: 'buy',
      shares: sharesToInteger(1),
      price: priceToInteger(50),
    });

    await expect(deleteSecurity({ id: sec.id })).rejects.toThrow(
      /investment transactions/,
    );

    await deleteInvestmentTransaction({ id: txn.id });
    await deleteSecurity({ id: sec.id });

    expect((await getSecurities()).length).toBe(0);
  });
});

describe('Investment transactions', () => {
  test('a buy creates a holding with cost basis and gain', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI' });

    await createInvestmentTransaction({
      account: 'acct',
      security: sec.id,
      date: '2024-01-01',
      type: 'buy',
      shares: sharesToInteger(10),
      price: priceToInteger(80),
    });
    await setSecurityPrices({
      security: sec.id,
      prices: [{ date: monthUtils.currentDay(), price: priceToInteger(100) }],
    });

    const [holding] = await getHoldings({ accountId: 'acct' });
    expect(holding.shares).toBe(sharesToInteger(10));
    expect(holding.cost_basis).toBe(80000); // 10 * $80 = $800.00
    expect(holding.market_value).toBe(100000); // 10 * $100 = $1000.00
    expect(holding.gain).toBe(20000); // $200.00
    expect(holding.gain_percent).toBeCloseTo(0.25);
  });

  test('multiple buys accumulate shares and average the cost basis', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI' });

    await createInvestmentTransaction({
      account: 'acct',
      security: sec.id,
      date: '2024-01-01',
      type: 'buy',
      shares: sharesToInteger(10),
      price: priceToInteger(50),
    });
    await createInvestmentTransaction({
      account: 'acct',
      security: sec.id,
      date: '2024-02-01',
      type: 'buy',
      shares: sharesToInteger(10),
      price: priceToInteger(100),
    });

    const [holding] = await getHoldings({ accountId: 'acct' });
    expect(holding.shares).toBe(sharesToInteger(20));
    expect(holding.cost_basis).toBe(150000); // $500 + $1000
  });

  test('a sell reduces shares and cost basis proportionally', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI' });

    await createInvestmentTransaction({
      account: 'acct',
      security: sec.id,
      date: '2024-01-01',
      type: 'buy',
      shares: sharesToInteger(10),
      price: priceToInteger(100),
    });
    await createInvestmentTransaction({
      account: 'acct',
      security: sec.id,
      date: '2024-03-01',
      type: 'sell',
      shares: sharesToInteger(4),
      price: priceToInteger(150),
    });

    const [holding] = await getHoldings({ accountId: 'acct' });
    expect(holding.shares).toBe(sharesToInteger(6));
    expect(holding.cost_basis).toBe(60000); // 6 of 10 shares of $1000 basis
  });

  test('selling the entire position removes the holding', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI' });

    await createInvestmentTransaction({
      account: 'acct',
      security: sec.id,
      date: '2024-01-01',
      type: 'buy',
      shares: sharesToInteger(10),
      price: priceToInteger(100),
    });
    await createInvestmentTransaction({
      account: 'acct',
      security: sec.id,
      date: '2024-03-01',
      type: 'sell',
      shares: sharesToInteger(10),
      price: priceToInteger(150),
    });

    const holdings = await getHoldings({ accountId: 'acct' });
    expect(holdings.length).toBe(0);
  });

  test('rejects non positive shares and unknown types', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI' });

    await expect(
      createInvestmentTransaction({
        account: 'acct',
        security: sec.id,
        date: '2024-01-01',
        type: 'buy',
        shares: 0,
        price: priceToInteger(50),
      }),
    ).rejects.toThrow(/positive/);

    await expect(
      createInvestmentTransaction({
        account: 'acct',
        security: sec.id,
        date: '2024-01-01',
        // @ts-expect-error testing invalid input
        type: 'split',
        shares: sharesToInteger(1),
        price: priceToInteger(50),
      }),
    ).rejects.toThrow(/buy.*sell/);
  });

  test('investment-transactions-get returns rows with ticker and date', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI', name: 'Vanguard' });

    await createInvestmentTransaction({
      account: 'acct',
      security: sec.id,
      date: '2024-01-01',
      type: 'buy',
      shares: sharesToInteger(3),
      price: priceToInteger(20),
    });

    const txns = await getInvestmentTransactions({ accountId: 'acct' });
    expect(txns.length).toBe(1);
    expect(txns[0]).toMatchObject({
      ticker: 'VTI',
      security_name: 'Vanguard',
      date: '2024-01-01',
      type: 'buy',
      shares: sharesToInteger(3),
      price: priceToInteger(20),
    });
  });

  test('updating an investment transaction changes the derived holding', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI' });

    const txn = await createInvestmentTransaction({
      account: 'acct',
      security: sec.id,
      date: '2024-01-01',
      type: 'buy',
      shares: sharesToInteger(10),
      price: priceToInteger(100),
    });

    await updateInvestmentTransaction({
      id: txn.id,
      shares: sharesToInteger(5),
    });

    const [holding] = await getHoldings({ accountId: 'acct' });
    expect(holding.shares).toBe(sharesToInteger(5));
    expect(holding.cost_basis).toBe(50000);
  });

  test('holdings-value uses the most recent price on or before each date and only counts transactions up to that date', async () => {
    await db.insertAccount({ id: 'acct', name: 'Brokerage' });
    const sec = await createSecurity({ ticker: 'VTI' });
    await createInvestmentTransaction({
      account: 'acct',
      security: sec.id,
      date: '2024-02-01',
      type: 'buy',
      shares: sharesToInteger(10),
      price: priceToInteger(50),
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
      { date: '2023-12-31', value: 0 }, // no transactions yet
      { date: '2024-03-01', value: 50000 }, // 10 shares @ $50
      { date: '2024-07-01', value: 75000 }, // 10 shares @ $75
    ]);
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
