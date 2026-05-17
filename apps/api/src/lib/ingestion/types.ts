/**
 * Types for the transcript ingestion pipeline.
 */

import type { NodeType, EdgeType } from '@heybeaux/inos-types';

// --- Raw extraction from LLM (before conversion to InosGraph) ---

// Aligned with packages/types NodeType — multi-pass extraction needs the
// full enum (especially insight/branch/constraint which the reference
// graphs use heavily).
export type ExtractedNodeType =
  | 'claim'
  | 'question'
  | 'decision'
  | 'evidence'
  | 'fact'
  | 'assumption'
  | 'insight'
  | 'branch'
  | 'constraint'
  | 'deliberation'
  | 'synthesis'
  | 'artifact';

// Aligned with packages/types EdgeType — adds replaces/merges/inherits/
// temporal which solo-thinking content (esp. self-debate / position
// reversals) genuinely needs.
export type ExtractedEdgeType =
  | 'supports'
  | 'challenges'
  | 'diverges'
  | 'depends_on'
  | 'refines'
  | 'references'
  | 'replaces'
  | 'merges'
  | 'inherits'
  | 'temporal';

export interface ExtractedNode {
  /** Stable id used within the extraction result (refs between nodes/edges) */
  id: string;
  type: ExtractedNodeType;
  /** Short title / summary */
  title: string;
  /** Full content of the node */
  content: string;
  /** Speaker/participant who said this, or 'AI' if inferred */
  author: string;
  /** IDs of other nodes this depends on (resolved later) */
  dependsOn: string[];
  /** Stable key for fact nodes (e.g. 'hydrothermal_vents_year') */
  factKey?: string;
}

export interface ExtractedEdge {
  type: ExtractedEdgeType;
  /** References ExtractedNode.id */
  source: string;
  /** References ExtractedNode.id */
  target: string;
  label?: string;
}

/** The raw JSON shape the LLM is instructed to output. */
export interface ExtractionResult {
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
  canvasName: string;
  summary: string;
}

// --- Force-directed layout output ---

export interface PositionedNode extends ExtractedNode {
  x: number;
  y: number;
  z: number;
}

// --- Ingest request / response (API layer) ---

export type InputFormat = 'slack' | 'email' | 'meeting' | 'raw' | 'auto';

export interface IngestRequest {
  text: string;
  format?: InputFormat;
  topic?: string;
  config?: {
    model?: string;
    extractFacts?: boolean;
    extractAssumptions?: boolean;
    extractDecisions?: boolean;
  };
}

export interface IngestStats {
  nodesExtracted: number;
  edgesExtracted: number;
  factsExtracted: number;
  decisionsExtracted: number;
  questionsExtracted: number;
  /** Edges dropped by the validator for referencing unknown node ids. */
  edgesDropped: number;
}

export interface IngestResponse {
  graph: unknown; // InosGraph (imported dynamically to avoid circular deps)
  stats: IngestStats;
}
