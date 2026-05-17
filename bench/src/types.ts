import type { NodeType, EdgeType } from '@heybeaux/inos-types';

export interface ReferenceNode {
  id: string;
  type: NodeType;
  title: string;
  /**
   * Aliases the grader will accept as equivalent titles when matching
   * against extracted node titles (case-insensitive substring match).
   * If absent, only `title` is matched.
   */
  aliases?: string[];
  dependsOn?: string[];
}

export interface ReferenceEdge {
  type: EdgeType;
  source: string;
  target: string;
}

export interface ReferenceGraph {
  fixtureId: string;
  description: string;
  format: 'slack' | 'email' | 'meeting' | 'raw' | 'auto';
  topic?: string;
  /** Hand-curated set of nodes the extractor MUST recover. */
  nodes: ReferenceNode[];
  /** Hand-curated set of structural relationships the extractor SHOULD recover. */
  edges: ReferenceEdge[];
  /** Type distribution sanity check — number of nodes of each type expected. */
  expectedTypeCounts?: Partial<Record<NodeType, number>>;
}

export interface FixtureRunResult {
  fixtureId: string;
  passes: number;
  /** Per-pass observed metrics. Length === passes. */
  perPassMetrics: PassMetrics[];
  /** Aggregate across passes. */
  aggregate: AggregateMetrics;
  /** Did all passes structurally agree? (determinism check) */
  deterministic: boolean;
  error?: string;
}

export interface PassMetrics {
  pass: number;
  nodesExtracted: number;
  edgesExtracted: number;
  nodeRecall: number;
  edgePrecision: number;
  schemaValid: boolean;
  matchedNodeIds: string[];
  missedNodeIds: string[];
  spuriousEdgeCount: number;
  durationMs: number;
}

export interface AggregateMetrics {
  avgNodeRecall: number;
  avgEdgePrecision: number;
  schemaValidRate: number;
  avgDurationMs: number;
}

export interface BenchConfig {
  apiUrl: string;
  passes: number;
  thresholds: {
    nodeRecall: number;
    edgePrecision: number;
    schemaValidRate: number;
  };
}

export interface BenchReport {
  startedAt: string;
  finishedAt: string;
  config: BenchConfig;
  results: FixtureRunResult[];
  passed: boolean;
  failures: string[];
}
