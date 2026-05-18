import express from 'express';

import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '#util/middlewares';

const app = express();
export { app as handlers };
app.use(requestLoggerMiddleware);
app.use(express.json());
app.use(validateSessionMiddleware);

type YahooChartResult = {
  timestamp?: number[];
  indicators?: {
    quote?: Array<{ close?: (number | null)[] }>;
  };
};

type YahooChartResponse = {
  chart?: {
    result?: YahooChartResult[] | null;
    error?: { code: string; description: string } | null;
  };
};

function priceToInteger(price: number): number {
  return Math.round(price * 10000);
}

app.post('/prices', async (req, res) => {
  const { ticker } = req.body || {};

  if (!ticker || typeof ticker !== 'string') {
    res.status(400).send({ status: 'error', reason: 'ticker-required' });
    return;
  }

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;

  let text: string;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) {
      res.status(502).send({
        status: 'error',
        reason: `Yahoo Finance returned ${response.status} for ${ticker}`,
      });
      return;
    }
    text = await response.text();
  } catch (e) {
    res.status(502).send({
      status: 'error',
      reason: `Network error fetching prices for ${ticker}`,
    });
    return;
  }

  let json: YahooChartResponse;
  try {
    json = JSON.parse(text) as YahooChartResponse;
  } catch {
    res.status(502).send({
      status: 'error',
      reason: `Invalid JSON from Yahoo Finance for ${ticker}`,
    });
    return;
  }

  if (json?.chart?.error) {
    res.status(502).send({
      status: 'error',
      reason: `Yahoo Finance error for ${ticker}: ${json.chart.error.description}`,
    });
    return;
  }

  const result = json?.chart?.result?.[0];
  if (!result) {
    res.status(502).send({
      status: 'error',
      reason: `No price data found for ${ticker}`,
    });
    return;
  }

  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const prices: Array<{ date: string; price: number }> = [];

  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    prices.push({ date, price: priceToInteger(close) });
  }

  res.send({ status: 'ok', data: { prices } });
});
