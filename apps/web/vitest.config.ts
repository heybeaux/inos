import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Smoke-test config for the web app. Intentionally narrow:
// - jsdom env so zustand's `create` works without a window
// - no 3D / R3F coverage (those need a real GL context)
// - `@/*` aliased to the app root to mirror tsconfig paths.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['lib/**/*.test.ts', 'components/**/*.test.{ts,tsx}'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
