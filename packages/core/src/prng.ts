/**
 * Seedable PRNG utilities for deterministic layout.
 *
 * Inos layouts use random number generation for initial node positions.
 * Unseeded `Math.random()` makes layouts non-reproducible: the same
 * canvas renders differently on every reload, every server restart,
 * and across web↔api boundaries. Both visual diff testing and
 * server-rendered preview images need a stable seed.
 *
 * `mulberry32` is a tiny, fast, non-cryptographic 32-bit PRNG.  It is
 * not suitable for security but is more than enough for layout jitter.
 *
 * `seedFromString` is a small string hash (FNV-1a-ish) that turns a
 * canvasId into a uint32 seed.  Not cryptographic — collisions are
 * fine; we only need stability.
 */

/**
 * Build a deterministic [0, 1) random function from a uint32 seed.
 *
 * @example
 *   const rand = mulberry32(seedFromString(canvasId));
 *   const x = rand() * 100; // same value every call with same seed
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash an arbitrary string into a uint32 seed.
 *
 * Uses an FNV-1a-style charCode fold.  Not cryptographic; collisions
 * are acceptable.  Empty / nullish strings hash to a stable nonzero
 * constant so callers do not have to special-case them.
 */
export function seedFromString(input: string | null | undefined): number {
  // FNV-1a 32-bit offset basis; matches the seed used for blank inputs
  // so layouts don't collapse onto seed=0.
  let h = 0x811c9dc5;
  const s = input ?? '';
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
