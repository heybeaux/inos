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
});
