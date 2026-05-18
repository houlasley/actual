import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handlers as app } from './app-securities';

global.fetch = vi.fn();

const makeYahooResponse = (
  closes: (number | null)[],
  timestamps: number[],
) => ({
  chart: {
    result: [
      {
        timestamp: timestamps,
        indicators: { quote: [{ close: closes }] },
      },
    ],
    error: null,
  },
});

describe('/securities/prices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/prices').send({ ticker: 'AAPL' });

    expect(res.statusCode).toEqual(401);
  });

  it('returns 400 when ticker is missing', async () => {
    const res = await request(app)
      .post('/prices')
      .set('x-actual-token', 'valid-token')
      .send({});

    expect(res.statusCode).toEqual(400);
    expect(res.body).toMatchObject({
      status: 'error',
      reason: 'ticker-required',
    });
  });

  it('returns prices from Yahoo Finance', async () => {
    const timestamps = [1704067200, 1704153600]; // 2024-01-01, 2024-01-02
    const closes = [185.5, 186.0];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify(makeYahooResponse(closes, timestamps)),
        ),
    });

    const res = await request(app)
      .post('/prices')
      .set('x-actual-token', 'valid-token')
      .send({ ticker: 'AAPL' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
    expect(res.body.data.prices).toHaveLength(2);
    expect(res.body.data.prices[0]).toMatchObject({ date: '2024-01-01' });
    expect(res.body.data.prices[1]).toMatchObject({ date: '2024-01-02' });
  });

  it('skips null or zero close prices', async () => {
    const timestamps = [1704067200, 1704153600, 1704240000];
    const closes = [185.5, null, 0];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify(makeYahooResponse(closes as number[], timestamps)),
        ),
    });

    const res = await request(app)
      .post('/prices')
      .set('x-actual-token', 'valid-token')
      .send({ ticker: 'AAPL' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.prices).toHaveLength(1);
  });

  it('returns 502 when Yahoo Finance returns an error status', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    });

    const res = await request(app)
      .post('/prices')
      .set('x-actual-token', 'valid-token')
      .send({ ticker: 'INVALID' });

    expect(res.statusCode).toEqual(502);
    expect(res.body.status).toEqual('error');
  });

  it('returns 502 when Yahoo Finance returns an API error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            chart: {
              result: null,
              error: {
                code: 'Not Found',
                description: 'No fundamentals data found',
              },
            },
          }),
        ),
    });

    const res = await request(app)
      .post('/prices')
      .set('x-actual-token', 'valid-token')
      .send({ ticker: 'BADTICKER' });

    expect(res.statusCode).toEqual(502);
    expect(res.body.status).toEqual('error');
  });

  it('returns 502 when network fetch fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error'),
    );

    const res = await request(app)
      .post('/prices')
      .set('x-actual-token', 'valid-token')
      .send({ ticker: 'AAPL' });

    expect(res.statusCode).toEqual(502);
    expect(res.body.status).toEqual('error');
  });
});
