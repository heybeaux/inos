import { describe, it, expect } from 'vitest';
import { mulberry32, seedFromString } from './prng.js';

describe('mulberry32', () => {
  it('returns the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const aSeq = Array.from({ length: 16 }, () => a());
    const bSeq = Array.from({ length: 16 }, () => b());
    expect(aSeq).toEqual(bSeq);
  });

  it('returns a different sequence for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const aSeq = Array.from({ length: 8 }, () => a());
    const bSeq = Array.from({ length: 8 }, () => b());
    expect(aSeq).not.toEqual(bSeq);
  });

  it('always yields values in [0, 1)', () => {
    const r = mulberry32(seedFromString('canvas-xyz'));
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('seedFromString', () => {
  it('is stable for the same input', () => {
    expect(seedFromString('canvas-1')).toBe(seedFromString('canvas-1'));
  });

  it('differs across typical canvas ids', () => {
    expect(seedFromString('canvas-a')).not.toBe(seedFromString('canvas-b'));
  });

  it('handles null / undefined / empty without throwing', () => {
    expect(typeof seedFromString(null)).toBe('number');
    expect(typeof seedFromString(undefined)).toBe('number');
    expect(typeof seedFromString('')).toBe('number');
    // Empty / nullish all collapse to the same constant seed.
    expect(seedFromString(null)).toBe(seedFromString(''));
    expect(seedFromString(undefined)).toBe(seedFromString(''));
  });

  it('always returns a uint32 (non-negative, integer)', () => {
    for (const s of ['x', 'longer-string', 'canvas-id-1', '!@#$%']) {
      const v = seedFromString(s);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
