/**
 * Source-span resolution for ingested nodes.
 *
 * The LLM emits a verbatim `excerpt` string per node; we compute exact
 * character offsets, line numbers, and conversational/section context
 * post-hoc against the ORIGINAL input text (not the model's recall of it).
 *
 * Strategy is layered:
 *   1. Exact case-insensitive substring match
 *   2. Whitespace-normalized match (collapse runs of \s+), mapped back
 *   3. Longest-common-substring fuzzy match (≥20 chars)
 *   4. Give up — return undefined. We never fabricate offsets.
 */

import type { NodeSourceSpan } from '@heybeaux/inos-types';

// --- Public API ---

export type ResolveStrategy = 'exact' | 'normalized' | 'fuzzy' | 'unresolved';

export interface ResolveStats {
  exact: number;
  normalized: number;
  fuzzy: number;
  unresolved: number;
}

export function emptyResolveStats(): ResolveStats {
  return { exact: 0, normalized: 0, fuzzy: 0, unresolved: 0 };
}

export function resolveSourceSpan(
  originalText: string,
  excerpt: string,
  stats?: ResolveStats,
): NodeSourceSpan | undefined {
  const tally = (s: ResolveStrategy): void => {
    if (stats) stats[s]++;
  };

  if (!originalText || !excerpt) {
    tally('unresolved');
    return undefined;
  }
  const cleaned = excerpt.trim();
  if (!cleaned) {
    tally('unresolved');
    return undefined;
  }

  // 1. Exact (case-insensitive) substring match
  const exact = exactMatch(originalText, cleaned);
  if (exact) {
    tally('exact');
    return finalize(originalText, exact.startChar, exact.endChar);
  }

  // 2. Whitespace-normalized match
  const normalized = whitespaceNormalizedMatch(originalText, cleaned);
  if (normalized) {
    tally('normalized');
    return finalize(originalText, normalized.startChar, normalized.endChar);
  }

  // 3. Fuzzy / longest-common-substring fallback (≥20 chars)
  const fuzzy = fuzzyMatch(originalText, cleaned, 20);
  if (fuzzy) {
    tally('fuzzy');
    return finalize(originalText, fuzzy.startChar, fuzzy.endChar);
  }

  tally('unresolved');
  return undefined;
}

// --- Internal: strategies ---

interface CharRange {
  startChar: number;
  endChar: number;
}

function exactMatch(haystack: string, needle: string): CharRange | undefined {
  const idx = haystack.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return undefined;
  return { startChar: idx, endChar: idx + needle.length };
}

/**
 * Whitespace-normalized match. Collapse runs of whitespace (space, tab,
 * newline) to a single space in both haystack and needle, locate the
 * match in the normalized haystack, then map the start/end indices back
 * to offsets in the ORIGINAL haystack using an index translation table.
 */
function whitespaceNormalizedMatch(
  haystack: string,
  needle: string,
): CharRange | undefined {
  const { normalized, originalIndex } = buildNormalizationMap(haystack);
  const normalizedNeedle = needle.replace(/\s+/g, ' ').trim();
  if (!normalizedNeedle) return undefined;

  const idx = normalized.toLowerCase().indexOf(normalizedNeedle.toLowerCase());
  if (idx === -1) return undefined;

  const endNormalized = idx + normalizedNeedle.length - 1;
  const startChar = originalIndex[idx];
  // endChar is exclusive — point to one past the last matched original char
  const endChar = originalIndex[endNormalized] + 1;
  if (startChar == null || endChar == null) return undefined;
  return { startChar, endChar };
}

/**
 * Build a normalization map from the original text:
 *   - `normalized`: original with runs of whitespace collapsed to single ' '
 *   - `originalIndex[i]`: char offset in `original` corresponding to
 *     position `i` in `normalized`.
 */
function buildNormalizationMap(
  original: string,
): { normalized: string; originalIndex: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let inRun = false;
  for (let i = 0; i < original.length; i++) {
    const ch = original[i];
    if (/\s/.test(ch)) {
      if (!inRun) {
        out.push(' ');
        map.push(i);
        inRun = true;
      }
    } else {
      out.push(ch);
      map.push(i);
      inRun = false;
    }
  }
  // Trim leading whitespace in normalized form to mirror .trim() on the
  // needle. We do this by detecting a leading single-space-from-whitespace
  // and dropping it from both arrays.
  let start = 0;
  if (out.length > 0 && out[0] === ' ' && /\s/.test(original[map[0]])) {
    start = 1;
  }
  let end = out.length;
  if (
    end > start &&
    out[end - 1] === ' ' &&
    /\s/.test(original[map[end - 1]])
  ) {
    end -= 1;
  }
  return {
    normalized: out.slice(start, end).join(''),
    originalIndex: map.slice(start, end),
  };
}

/**
 * Fuzzy fallback: find the longest contiguous case-insensitive substring
 * of `needle` that also appears in `haystack`, requiring at least
 * `minLen` chars to consider it a real hit. Returns the offsets of the
 * matched run inside `haystack` (not the entire needle).
 *
 * Uses an O(n*m) dynamic-programming longest-common-substring on the
 * lowercased strings. Inputs here are bounded (haystack = single
 * transcript, needle = 5-40 words), so this stays cheap in practice.
 */
function fuzzyMatch(
  haystack: string,
  needle: string,
  minLen: number,
): CharRange | undefined {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  const hLen = h.length;
  const nLen = n.length;
  if (hLen === 0 || nLen < minLen) return undefined;

  // Rolling 1-D DP — `prev[j]` = length of LCS ending at haystack[i-1], needle[j-1]
  let prev = new Int32Array(nLen + 1);
  let bestLen = 0;
  let bestEndH = -1; // exclusive end in haystack
  for (let i = 1; i <= hLen; i++) {
    const curr = new Int32Array(nLen + 1);
    for (let j = 1; j <= nLen; j++) {
      if (h.charCodeAt(i - 1) === n.charCodeAt(j - 1)) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > bestLen) {
          bestLen = curr[j];
          bestEndH = i;
        }
      }
    }
    prev = curr;
  }

  if (bestLen < minLen || bestEndH < 0) return undefined;
  return { startChar: bestEndH - bestLen, endChar: bestEndH };
}

// --- Internal: context + line ---

function finalize(
  originalText: string,
  startChar: number,
  endChar: number,
): NodeSourceSpan {
  const excerpt = originalText.slice(startChar, endChar);
  const startLine = computeStartLine(originalText, startChar);
  const context = computeContext(originalText, startChar);
  const span: NodeSourceSpan = {
    excerpt,
    startChar,
    endChar,
    startLine,
  };
  if (context) span.context = context;
  return span;
}

function computeStartLine(text: string, startChar: number): number {
  if (startChar < 0 || startChar > text.length) return -1;
  let line = 0;
  for (let i = 0; i < startChar; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Walk backward from startChar looking for the nearest context anchor on
 * its OWN line:
 *   - markdown heading: `^#{1,6} title`
 *   - conversation turn: `^User:`, `^Assistant:`, `^Name:` (capitalised)
 * If we hit a blank line before finding one, give up and return undefined.
 * (Blank line = section break; we won't bleed across it.)
 */
function computeContext(text: string, startChar: number): string | undefined {
  if (startChar <= 0) return undefined;

  // Collect line spans up to AND INCLUDING the line that contains startChar.
  // We must capture the partial current line (everything from the prior
  // newline through end-of-line, where end-of-line is the next \n or EOF),
  // so that prefixes like "User:" that live on the same line as the excerpt
  // are still detectable.
  const lines: { start: number; end: number; text: string }[] = [];
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 10) {
      lines.push({
        start: lineStart,
        end: i,
        text: text.slice(lineStart, i),
      });
      // Stop once we've captured the line that contains startChar.
      if (i >= startChar) break;
      lineStart = i + 1;
    }
  }

  // Walk backward (current line first, then prior lines)
  for (let li = lines.length - 1; li >= 0; li--) {
    const ln = lines[li].text;
    const trimmed = ln.trim();

    // Blank line — only treat as a section break if it's NOT the current
    // line. The "current" line is the one containing startChar; if our
    // excerpt starts at column 0 of an otherwise blank-looking line we
    // still want to look further back.
    if (trimmed === '' && li !== lines.length - 1) {
      return undefined;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      return `${heading[1]} ${heading[2].trim()}`;
    }

    const turn = ln.match(/^([A-Z][A-Za-z0-9_\- ]{0,40}):\s/);
    if (turn) {
      return turn[1].trim();
    }
  }

  return undefined;
}
