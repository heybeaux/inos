import levenshtein from 'fast-levenshtein';

export type DedupResult = {
  /** Fact key that was matched. */
  key: string;
  /** Node IDs that describe the same fact. */
  duplicateGroup: string[];
  /** Similarity score 0-1. */
  similarity: number;
  /** Whether this is an obvious (>90%) or borderline (70-90%) match. */
  confidence: 'obvious' | 'borderline' | 'different';
};

/**
 * Fact deduplication engine.
 *
 * Uses edit distance for obvious duplicates, exposes hooks for
 * LLM-based matching on borderline cases.
 */
export class DedupEngine {
  /** Threshold for auto-merge (similarity >= this value). */
  static OBVIOUS_THRESHOLD = 0.9;
  /** Threshold above which we flag as potential duplicate (borderline). */
  static BORDERLINE_THRESHOLD = 0.7;

  /**
   * Calculate normalized similarity between two strings.
   */
  static similarity(a: string, b: string): number {
    const d = levenshtein.get(a.toLowerCase(), b.toLowerCase());
    return 1 - d / Math.max(a.length, b.length, 1);
  }

  /**
   * Compare two fact labels and return a dedup result.
   */
  static compare(labelA: string, labelB: string): DedupResult {
    const sim = this.similarity(labelA, labelB);
    let confidence: DedupResult['confidence'];

    if (sim >= this.OBVIOUS_THRESHOLD) {
      confidence = 'obvious';
    } else if (sim >= this.BORDERLINE_THRESHOLD) {
      confidence = 'borderline';
    } else {
      confidence = 'different';
    }

    return {
      key: this.normalizeKey(labelA),
      duplicateGroup: [this.normalizeKey(labelA), this.normalizeKey(labelB)],
      similarity: sim,
      confidence,
    };
  }

  /**
   * Find duplicate groups in a list of fact labels.
   */
  static findDuplicates(
    facts: { nodeId: string; label: string }[],
  ): DedupResult[] {
    const results: DedupResult[] = [];

    for (let i = 0; i < facts.length; i++) {
      for (let j = i + 1; j < facts.length; j++) {
        const result = this.compare(facts[i].label, facts[j].label);
        if (result.confidence !== 'different') {
          results.push({
            ...result,
            duplicateGroup: [facts[i].nodeId, facts[j].nodeId],
          });
        }
      }
    }

    return results;
  }

  /**
   * Normalize a label into a stable fact key.
   * e.g., "API Rate Limit" → "api_rate_limit"
   */
  static normalizeKey(label: string): string {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/-+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }
}
