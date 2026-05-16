import { describe, it, expect } from 'vitest';
import { DedupEngine } from './dedup.js';

describe('DedupEngine', () => {
  it('should detect similar strings', () => {
    const str1 = 'This is a test sentence.';
    const str2 = 'This is a test sentance.'; // intentional typo

    const sim = DedupEngine.similarity(str1, str2);
    expect(sim).toBeGreaterThan(0.8);
  });

  it('should distinguish different strings', () => {
    const str1 = 'This is a test sentence.';
    const str2 = 'Completely unrelated content.';

    const sim = DedupEngine.similarity(str1, str2);
    expect(sim).toBeLessThan(0.5);
  });

  it('should normalize keys consistently', () => {
    expect(DedupEngine.normalizeKey('API Rate Limit')).toBe('api_rate_limit');
    expect(DedupEngine.normalizeKey('API-rate-limit')).toBe('api_rate_limit');
    expect(DedupEngine.normalizeKey('api rate limit')).toBe('api_rate_limit');
  });

  it('should compare with correct confidence levels', () => {
    const result = DedupEngine.compare('API Rate Limit', 'API Rate Limit');
    expect(result.confidence).toBe('obvious');

    const result2 = DedupEngine.compare('API Rate Limit', 'API rate limit');
    expect(result2.confidence).toBe('obvious');

    const result3 = DedupEngine.compare('Budget', 'Launch Date');
    expect(result3.confidence).toBe('different');
  });

  it('should find duplicates in a list', () => {
    const facts = [
      { nodeId: 'a', label: 'API Rate Limit' },
      { nodeId: 'b', label: 'API Rate Limit' },
      { nodeId: 'c', label: 'Budget' },
    ];

    const duplicates = DedupEngine.findDuplicates(facts);
    expect(duplicates.length).toBe(1);
    expect(duplicates[0].confidence).toBe('obvious');
  });
});
