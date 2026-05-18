/**
 * Auth + body-cap + rate-limit middleware tests (Issue #3).
 *
 * We exercise the middlewares against a stand-alone Hono app rather than
 * the full apps/api server so we can isolate behavior without needing a
 * database.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  authMiddleware,
  bodyLimitMiddleware,
  rateLimitMiddleware,
  _resetRateLimiterForTests,
} from './auth.js';

function makeApp() {
  const app = new Hono();
  app.use('/*', bodyLimitMiddleware);
  app.use('/*', rateLimitMiddleware);
  app.use('/*', authMiddleware);
  app.get('/health', (c) => c.json({ ok: true }));
  app.get('/api/canvases', (c) => c.json([]));
  app.post('/api/ingest', async (c) => {
    const body = await c.req.text();
    return c.json({ len: body.length });
  });
  app.post('/api/canvases', async (c) => c.json({ ok: true }, 201));
  return app;
}

beforeEach(() => {
  _resetRateLimiterForTests();
  process.env.INOS_API_TOKEN = 'sekret';
});

describe('authMiddleware', () => {
  it('lets /health through with no bearer', async () => {
    const res = await makeApp().fetch(new Request('http://x/health'));
    expect(res.status).toBe(200);
  });

  it('returns 401 when bearer is missing', async () => {
    const res = await makeApp().fetch(new Request('http://x/api/canvases'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when bearer is wrong', async () => {
    const res = await makeApp().fetch(
      new Request('http://x/api/canvases', { headers: { Authorization: 'Bearer nope' } }),
    );
    expect(res.status).toBe(401);
  });

  it('accepts the configured bearer', async () => {
    const res = await makeApp().fetch(
      new Request('http://x/api/canvases', { headers: { Authorization: 'Bearer sekret' } }),
    );
    expect(res.status).toBe(200);
  });

  it('refuses to serve when INOS_API_TOKEN is unset', async () => {
    delete process.env.INOS_API_TOKEN;
    const res = await makeApp().fetch(
      new Request('http://x/api/canvases', { headers: { Authorization: 'Bearer anything' } }),
    );
    expect(res.status).toBe(503);
  });
});

describe('bodyLimitMiddleware', () => {
  it('rejects >8KB on non-ingest POST', async () => {
    const big = 'x'.repeat(9 * 1024);
    const res = await makeApp().fetch(
      new Request('http://x/api/canvases', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sekret',
          'content-length': String(big.length),
        },
        body: big,
      }),
    );
    expect(res.status).toBe(413);
  });

  it('rejects >64KB on /api/ingest', async () => {
    const big = 'y'.repeat(65 * 1024);
    const res = await makeApp().fetch(
      new Request('http://x/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sekret',
          'content-length': String(big.length),
        },
        body: big,
      }),
    );
    expect(res.status).toBe(413);
  });

  it('accepts payloads under the cap', async () => {
    const ok = 'z'.repeat(1024);
    const res = await makeApp().fetch(
      new Request('http://x/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sekret',
          'content-length': String(ok.length),
        },
        body: ok,
      }),
    );
    expect(res.status).toBe(200);
  });
});

describe('rateLimitMiddleware', () => {
  it('caps ingests at 10/min/IP', async () => {
    const app = makeApp();
    const make = () =>
      new Request('http://x/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sekret',
          'X-Forwarded-For': '203.0.113.5',
          'content-length': '4',
        },
        body: 'abcd',
      });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await app.fetch(make());
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
  });
});
