/**
 * CORS config resolver tests (Issue #16).
 */

import { describe, expect, it } from 'vitest';
import { resolveCorsConfig } from './cors-config.js';

describe('resolveCorsConfig', () => {
  it('returns dev defaults when INOS_ALLOWED_ORIGINS is unset', () => {
    const cfg = resolveCorsConfig({ credentials: false });
    expect(cfg.origins).toEqual([
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3003',
    ]);
    expect(cfg.credentials).toBe(false);
  });

  it('parses a comma-separated env value', () => {
    const cfg = resolveCorsConfig({
      rawOrigins: 'https://a.example, https://b.example , https://c.example',
      credentials: false,
    });
    expect(cfg.origins).toEqual([
      'https://a.example',
      'https://b.example',
      'https://c.example',
    ]);
  });

  it('refuses to start when credentials=true AND origins include *', () => {
    expect(() =>
      resolveCorsConfig({
        rawOrigins: 'https://a.example,*',
        credentials: true,
      }),
    ).toThrow(/credentials=true with wildcard/);
  });

  it('accepts credentials=true when no wildcard origin is listed', () => {
    expect(() =>
      resolveCorsConfig({
        rawOrigins: 'https://a.example,https://b.example',
        credentials: true,
      }),
    ).not.toThrow();
  });

  it('accepts wildcard origin when credentials=false', () => {
    const cfg = resolveCorsConfig({ rawOrigins: '*', credentials: false });
    expect(cfg.origins).toEqual(['*']);
    expect(cfg.credentials).toBe(false);
  });
});
