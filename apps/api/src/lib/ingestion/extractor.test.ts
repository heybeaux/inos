/**
 * Tests for the code-fence stripper (Issue #14).
 *
 * The original regex was non-greedy and would lop off a JSON tail any
 * time the JSON itself contained a "```" substring inside a string
 * value. We replaced it with an "outermost fence pair only" stripper.
 */

import { describe, expect, it } from 'vitest';
import { stripCodeFence } from './extractor.js';

describe('stripCodeFence', () => {
  it('returns input unchanged when there is no fence', () => {
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}');
    expect(stripCodeFence('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('strips the outermost ```json fence pair', () => {
    const raw = '```json\n{"a":1}\n```';
    expect(stripCodeFence(raw)).toBe('{"a":1}');
  });

  it('strips a bare ``` fence pair', () => {
    const raw = '```\n{"a":1}\n```';
    expect(stripCodeFence(raw)).toBe('{"a":1}');
  });

  it('preserves stray ``` substrings inside string values', () => {
    // The OLD non-greedy regex would match `{"text":"see ` and choke;
    // the new stripper walks to the LAST ``` so the inner one survives.
    const raw =
      '```json\n{"text":"the answer used ``` to demarcate code","ok":true}\n```';
    const out = stripCodeFence(raw);
    expect(out).toContain('"ok":true');
    expect(JSON.parse(out)).toEqual({
      text: 'the answer used ``` to demarcate code',
      ok: true,
    });
  });

  it('handles trailing whitespace after the closing fence', () => {
    const raw = '```json\n{"a":1}\n```\n   \n';
    expect(stripCodeFence(raw)).toBe('{"a":1}');
  });
});
