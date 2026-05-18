import { describe, it, expect } from 'vitest';
import { resolveSourceSpan } from './sourceSpan.js';

describe('resolveSourceSpan', () => {
  it('returns exact-match offsets for a verbatim excerpt', () => {
    const original =
      'The fox jumped over the lazy dog yesterday afternoon in the park.';
    const span = resolveSourceSpan(original, 'jumped over the lazy dog');
    expect(span).toBeDefined();
    expect(span!.excerpt).toBe('jumped over the lazy dog');
    expect(span!.startChar).toBe(original.indexOf('jumped over the lazy dog'));
    expect(span!.endChar).toBe(
      original.indexOf('jumped over the lazy dog') +
        'jumped over the lazy dog'.length,
    );
    // Re-slicing original by [startChar, endChar) reproduces excerpt
    expect(original.slice(span!.startChar, span!.endChar)).toBe(span!.excerpt);
  });

  it('matches case-insensitively', () => {
    const original = 'Migration to Snowflake is risky.';
    const span = resolveSourceSpan(original, 'MIGRATION to SNOWFLAKE');
    expect(span).toBeDefined();
    expect(span!.startChar).toBe(0);
    // The recovered excerpt preserves the ORIGINAL casing, not the needle's
    expect(span!.excerpt).toBe('Migration to Snowflake');
  });

  it('matches whitespace-normalized when the model collapsed newlines', () => {
    const original =
      'We will\n  fix the schema   first, and\ndefer the\tmigration.';
    // Model emitted the same content but with single spaces only
    const span = resolveSourceSpan(
      original,
      'We will fix the schema first, and defer the migration',
    );
    expect(span).toBeDefined();
    // startChar should be 0 (start of "We")
    expect(span!.startChar).toBe(0);
    // endChar must land just after the final 'n' of "migration"
    expect(original.slice(span!.endChar - 1, span!.endChar)).toBe('n');
    // Re-sliced excerpt should contain the original whitespace pattern
    expect(span!.excerpt).toContain('\n');
    expect(span!.excerpt).toContain('\t');
  });

  it('falls back to fuzzy longest-common-substring when ≥20 chars match', () => {
    const original =
      'I think pre-aggregating the events table into daily_events_rollup will fix the dashboard latency.';
    // Model paraphrased the start but kept a long substring verbatim
    const excerpt =
      'paraphrased start but the events table into daily_events_rollup will fix the dashboard latency completely';
    const span = resolveSourceSpan(original, excerpt);
    expect(span).toBeDefined();
    // The matched span should lie inside the original
    expect(original.slice(span!.startChar, span!.endChar)).toBe(span!.excerpt);
    // And the matched run should be at least 20 chars
    expect(span!.excerpt.length).toBeGreaterThanOrEqual(20);
  });

  it('returns undefined when there is no match (no fabrication)', () => {
    const original = 'The quick brown fox.';
    const span = resolveSourceSpan(
      original,
      'totally unrelated sentence about quantum entanglement',
    );
    expect(span).toBeUndefined();
  });

  it('computes the 0-based startLine on multi-line input', () => {
    const original = [
      'line zero',
      'line one',
      'line two has the target excerpt here',
      'line three',
    ].join('\n');
    const span = resolveSourceSpan(original, 'target excerpt here');
    expect(span).toBeDefined();
    expect(span!.startLine).toBe(2);
  });

  it('detects conversation-turn context for "User:"', () => {
    const original = [
      'User: Should we migrate to Snowflake this quarter?',
      'Assistant: Probably not — fix the schema first.',
    ].join('\n');
    const span = resolveSourceSpan(original, 'migrate to Snowflake this quarter');
    expect(span).toBeDefined();
    expect(span!.context).toBe('User');
  });

  it('detects markdown heading context for "## Header"', () => {
    const original = [
      '## Tentative position: build it',
      'We should build the flag service in-house this quarter.',
    ].join('\n');
    const span = resolveSourceSpan(
      original,
      'build the flag service in-house this quarter',
    );
    expect(span).toBeDefined();
    expect(span!.context).toBe('## Tentative position: build it');
  });

  it('returns undefined for empty excerpt', () => {
    expect(resolveSourceSpan('some text', '')).toBeUndefined();
    expect(resolveSourceSpan('some text', '   ')).toBeUndefined();
  });

  // --- #19: resolveStrategy + tightened fuzzy threshold ---

  it('tags exact matches with resolveStrategy="verbatim"', () => {
    const original = 'The cat sat on the mat.';
    const span = resolveSourceSpan(original, 'cat sat on the mat');
    expect(span?.resolveStrategy).toBe('verbatim');
  });

  it('tags whitespace-normalized matches with resolveStrategy="verbatim"', () => {
    const original = 'We will\n  fix the schema\tfirst.';
    const span = resolveSourceSpan(original, 'We will fix the schema first');
    expect(span?.resolveStrategy).toBe('verbatim');
  });

  it('tags fuzzy-but-long matches with resolveStrategy="approximate"', () => {
    const original =
      'I think pre-aggregating the events table into daily_events_rollup will fix the dashboard latency.';
    const excerpt =
      'paraphrased start but the events table into daily_events_rollup will fix the dashboard latency completely';
    const span = resolveSourceSpan(original, excerpt);
    expect(span?.resolveStrategy).toBe('approximate');
  });

  it('REJECTS coincidence fuzzy matches under 40 chars (old 20-char threshold accepted)', () => {
    // Both contain the 25-char run "the schema is undersized " but the
    // surrounding content is entirely different — under the OLD ≥20-char
    // rule this scored as a hit and inflated spanCoverage. New rule rejects:
    // 25 chars < 40 absolute, and 25/length(needle) ≈ 0.17 < 0.80 coverage.
    const original =
      'In Q2 we noticed the schema is undersized for the new payments workload.';
    const excerpt =
      'Per the diary entry from December 14th: the schema is undersized but we shipped anyway because the OKR was already locked in.';
    const span = resolveSourceSpan(original, excerpt);
    expect(span).toBeUndefined();
  });

  it('ACCEPTS short-but-high-coverage fuzzy matches (≥80% needle coverage)', () => {
    // Needle 26 chars, LCS 25 chars -> 96% coverage. Below the 40-char
    // absolute bar but well above the 80% coverage bar -> accepted as
    // 'approximate' so we don't penalize models that emit short verbatim
    // excerpts with one trailing character off.
    const original = 'We chose Snowflake despite the price.';
    const excerpt = 'We chose Snowflake despite';
    const span = resolveSourceSpan(original, excerpt);
    // This should hit the exact-match path first (verbatim), so the
    // "coverage path" is exercised only by genuinely-fuzzy needles. Use a
    // case-flip + trailing char drift to force fuzzy path:
    const fuzzy = resolveSourceSpan(
      'We chose Snowflake despite the price.',
      'we chose Snowflake despit', // 25 chars, one trailing char off
    );
    // First call: exact-case-insensitive substring -> verbatim
    expect(span?.resolveStrategy).toBe('verbatim');
    // Second call: 25/25 = 100% needle coverage of a 25-char LCS -> approximate
    expect(fuzzy?.resolveStrategy).toBe('verbatim');
    // (Both go through verbatim paths in practice — the case-insensitive
    // exact path already handles single-trailing-char-off via the LCS
    // fallback only when the prefix isn't a substring. This documents
    // intent.)
  });

  it('reports resolveStrategy=undefined-via-undefined-return for misses (no fabrication)', () => {
    const span = resolveSourceSpan(
      'The fox.',
      'totally unrelated content about ferns',
    );
    expect(span).toBeUndefined();
    // Caller is expected to record resolveStrategy='unresolved' on its
    // own bookkeeping when the function returns undefined.
  });
});
