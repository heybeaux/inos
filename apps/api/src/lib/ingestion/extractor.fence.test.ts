/**
 * stripCodeFence unit tests (#14).
 *
 * Old non-greedy regex truncated JSON whenever a content string contained a
 * fence. New impl only strips an outer wrapper, otherwise leaves payload
 * untouched.
 */
import { describe, it, expect } from 'vitest';
import { stripCodeFence } from './extractor.js';

describe('stripCodeFence (#14)', () => {
  it('strips a plain ``` opener and closer', () => {
    const raw = '```\n{"a": 1}\n```';
    expect(stripCodeFence(raw)).toBe('{"a": 1}');
  });

  it('strips ```json opener', () => {
    const raw = '```json\n{"a": 1}\n```';
    expect(stripCodeFence(raw)).toBe('{"a": 1}');
  });

  it('leaves unfenced JSON untouched', () => {
    const raw = '{"a": 1}';
    expect(stripCodeFence(raw)).toBe('{"a": 1}');
  });

  it('does NOT strip when a fence appears only inside a string value', () => {
    // Old non-greedy regex would have matched
    //   ```json ... ``` (the inner one closing the match) -> mangled JSON
    // Correct behavior: leave as-is, let JSON.parse handle it.
    const raw = '{"content": "Example code block: ```js\\nfoo();\\n```"}';
    expect(stripCodeFence(raw)).toBe(raw);
  });

  it('does NOT strip when only an opener exists (malformed)', () => {
    const raw = '```\n{"a": 1}';
    // No closing fence — return as-is so JSON.parse fails loudly.
    expect(stripCodeFence(raw)).toBe(raw);
  });

  it('does NOT strip when only a closer exists', () => {
    const raw = '{"a": 1}\n```';
    expect(stripCodeFence(raw)).toBe(raw);
  });

  it('only strips the OUTERMOST fence pair', () => {
    // Inner fences inside a string survive untouched.
    const raw = [
      '```json',
      '{"content": "shows ```py\\nx=1\\n```"}',
      '```',
    ].join('\n');
    expect(stripCodeFence(raw)).toBe(
      '{"content": "shows ```py\\nx=1\\n```"}',
    );
  });

  it('trims surrounding whitespace', () => {
    const raw = '   \n```json\n{"a": 1}\n```   \n';
    expect(stripCodeFence(raw)).toBe('{"a": 1}');
  });
});
