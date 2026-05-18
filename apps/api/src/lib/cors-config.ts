/**
 * CORS config resolver (Issue #16).
 *
 * Centralizes the env parsing AND the hard-fail check for the
 * credentials=true + wildcard='*' combination. Browsers block that
 * pair by default, but some HTTP clients (and a handful of legacy
 * proxies) don't — and it's a classic CSRF foot-gun. If someone ever
 * flips credentials back on without removing '*', we want the server
 * to refuse to boot rather than silently expose every authenticated
 * route to drive-by origins.
 */

export interface CorsConfigInput {
  rawOrigins?: string;
  credentials: boolean;
  defaultOrigins?: string[];
}

export interface CorsConfig {
  origins: string[];
  credentials: boolean;
}

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3003',
];

export function resolveCorsConfig(input: CorsConfigInput): CorsConfig {
  const origins =
    typeof input.rawOrigins === 'string' && input.rawOrigins.trim().length > 0
      ? input.rawOrigins
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : (input.defaultOrigins ?? DEFAULT_DEV_ORIGINS);

  if (input.credentials && origins.includes('*')) {
    throw new Error(
      "[cors] Refusing to start: CORS credentials=true with wildcard origin '*' " +
        'is a CSRF foot-gun. Fix INOS_ALLOWED_ORIGINS or flip credentials off.',
    );
  }

  return { origins, credentials: input.credentials };
}
