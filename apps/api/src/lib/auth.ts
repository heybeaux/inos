/**
 * Bearer-token + body-size + rate-limit middleware (Issue #3).
 *
 * v1 design — single shared secret in INOS_API_TOKEN. This is the
 * "barely-secure" rung; the upgrade path is per-user JWTs once we have a
 * real user model. We document the v1 limitation in apps/api/.env.example
 * and apps/web/.env.local.example.
 *
 * Body caps:
 *   - 64KB on /api/ingest (transcripts get long but not THAT long)
 *   - 8KB on everything else (canvas CRUD payloads are tiny)
 *
 * Per-IP token bucket:
 *   - 10 ingests/min
 *   - 60 queries/min (everything else)
 *
 * Buckets are in-memory; horizontal scaling is not a v1 concern. Map is
 * lazily cleaned (we evict an entry as soon as it refills past its cap).
 */

import type { MiddlewareHandler } from 'hono';

const TOKEN_ENV = 'INOS_API_TOKEN';
const INGEST_BODY_LIMIT_BYTES = 64 * 1024;
// /api/query echoes the whole graph (nodes + edges) back to the API for
// LLM context, so it needs more headroom than CRUD endpoints.
const QUERY_BODY_LIMIT_BYTES = 256 * 1024;
const DEFAULT_BODY_LIMIT_BYTES = 8 * 1024;

const INGEST_PATH_PREFIX = '/api/ingest';
const QUERY_PATH_PREFIX = '/api/query';

interface Bucket {
  tokens: number;
  // ms timestamp of last refill
  refilledAt: number;
}

interface BucketConfig {
  capacity: number;
  // tokens replenished per second
  refillPerSec: number;
}

const INGEST_BUCKET: BucketConfig = { capacity: 10, refillPerSec: 10 / 60 };
const QUERY_BUCKET: BucketConfig = { capacity: 60, refillPerSec: 60 / 60 };

const ingestBuckets = new Map<string, Bucket>();
const queryBuckets = new Map<string, Bucket>();

function takeToken(map: Map<string, Bucket>, key: string, cfg: BucketConfig, now: number): boolean {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { tokens: cfg.capacity - 1, refilledAt: now });
    return true;
  }
  const elapsedSec = (now - existing.refilledAt) / 1000;
  existing.tokens = Math.min(cfg.capacity, existing.tokens + elapsedSec * cfg.refillPerSec);
  existing.refilledAt = now;
  if (existing.tokens >= 1) {
    existing.tokens -= 1;
    return true;
  }
  return false;
}

function clientIp(req: Request, fallback: string | undefined): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() || fallback || 'unknown';
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return fallback ?? 'unknown';
}

/**
 * Auth + body-size middleware. Skips `/health` so liveness probes work.
 * If INOS_API_TOKEN is unset, the middleware refuses to start the request
 * pipeline — production must not run unauthenticated.
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;
  if (path === '/health' || path === '/') {
    return next();
  }

  const expected = process.env[TOKEN_ENV];
  if (!expected) {
    return c.json(
      {
        error: `Server misconfigured: ${TOKEN_ENV} env var is not set.`,
        code: 'auth_not_configured',
      },
      503,
    );
  }

  const header = c.req.header('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const presented = match?.[1]?.trim();
  if (!presented || presented !== expected) {
    return c.json({ error: 'Unauthorized', code: 'invalid_token' }, 401);
  }

  return next();
};

/**
 * Reject requests whose Content-Length exceeds the per-route cap. Hono
 * doesn't expose a built-in chunked-body limit, but we don't accept
 * chunked uploads in v1, so Content-Length is sufficient as a guard.
 */
export const bodyLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'DELETE' || method === 'HEAD') {
    return next();
  }
  const path = c.req.path;
  const limit = path.startsWith(INGEST_PATH_PREFIX)
    ? INGEST_BODY_LIMIT_BYTES
    : path.startsWith(QUERY_PATH_PREFIX)
      ? QUERY_BODY_LIMIT_BYTES
      : DEFAULT_BODY_LIMIT_BYTES;

  const contentLengthHeader = c.req.header('content-length');
  if (contentLengthHeader) {
    const len = Number(contentLengthHeader);
    if (Number.isFinite(len) && len > limit) {
      return c.json(
        { error: `Request body too large (${len} > ${limit} bytes)`, code: 'body_too_large' },
        413,
      );
    }
  }
  return next();
};

/**
 * Per-IP token-bucket rate limiter. Two buckets: ingest (slow / expensive
 * LLM work) and everything else (cheap CRUD / query). `/health` is
 * exempt.
 */
export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  if (c.req.path === '/health' || c.req.path === '/') return next();
  const ip = clientIp(c.req.raw, c.env?.ip as string | undefined);
  const now = Date.now();
  const isIngest = c.req.path.startsWith(INGEST_PATH_PREFIX);
  const ok = isIngest
    ? takeToken(ingestBuckets, ip, INGEST_BUCKET, now)
    : takeToken(queryBuckets, ip, QUERY_BUCKET, now);
  if (!ok) {
    const retryAfter = Math.ceil(1 / (isIngest ? INGEST_BUCKET.refillPerSec : QUERY_BUCKET.refillPerSec));
    c.header('Retry-After', String(retryAfter));
    return c.json(
      {
        error: isIngest
          ? 'Rate limit exceeded (10 ingests/min/IP).'
          : 'Rate limit exceeded (60 requests/min/IP).',
        code: 'rate_limited',
        retryAfter,
      },
      429,
    );
  }
  return next();
};

// Test hook — flush buckets so each spec starts at full capacity.
export function _resetRateLimiterForTests(): void {
  ingestBuckets.clear();
  queryBuckets.clear();
}
