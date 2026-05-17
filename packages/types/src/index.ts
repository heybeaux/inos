export type NodeType =
  | 'claim'
  | 'question'
  | 'decision'
  | 'evidence'
  | 'branch'
  | 'synthesis'
  | 'deliberation'
  | 'constraint'
  | 'assumption'
  | 'insight'
  | 'artifact'
  | 'fact';

export type NodeContent =
  | string
  | { source: string; excerpt?: string; url?: string }
  | { parliamentId: string; topic: string; preset: string }
  | { mimeType: string; url: string; preview?: string }
  | { value: unknown; unit?: string; verifiedAt?: string };

export type NodeAuthor =
  | { type: 'human'; userId: string; displayName: string }
  | { type: 'agent'; agentId: string; model: string }
  | { type: 'system'; source: string };

export type NodeStatus =
  | 'fresh'
  | 'mature'
  | 'dormant'
  | 'stale'
  | 'negated'
  | 'orphaned';

export interface StalenessInfo {
  state: 'fresh' | 'stale' | 'negated' | 'orphaned';
  reason?: string;
  triggeredBy?: string;
  evaluatedAt: string;
  cascadeDepth: number;
}

export interface VisitRecord {
  visitor: NodeAuthor;
  at: string;
  action: 'read' | 'edit' | 'branch' | 'merge';
}

export interface NodeSourceSpan {
  excerpt: string;       // verbatim source excerpt (5-40 words)
  startChar: number;     // char offset in original text
  endChar: number;       // exclusive
  startLine: number;     // 0-based line, -1 if unknown
  context?: string;      // "User", "Assistant", "## Section header", etc.
}

export interface SonderSignature {
  signature: string;
  publicKey: string;
  governance: {
    tier: string;
    evidence: unknown[];
    policyRuleSetId?: string;
    policyRuleSetVersion?: string;
  };
  signedAt: string;
  signedHash: string;
}

export interface InosNode {
  id: string;
  type: NodeType;
  title: string;
  content: NodeContent;
  author: NodeAuthor;
  createdAt: string;
  updatedAt: string;
  visits: VisitRecord[];
  stateContractId?: string;
  dependsOn: string[];
  staleness: StalenessInfo;
  signature?: SonderSignature;
  engramMemoryId?: string;
  agentCapabilities?: string[];
  canvasId: string;
  status: NodeStatus;
  tags: string[];
  schemaVersion: string;
  sourceSpan?: NodeSourceSpan;
}

export type EdgeType =
  | 'supports'
  | 'challenges'
  | 'refines'
  | 'diverges'
  | 'merges'
  | 'depends_on'
  | 'references'
  | 'temporal'
  | 'replaces'
  | 'inherits';

export interface InosEdge {
  id: string;
  type: EdgeType;
  sourceId: string;
  targetId: string;
  label?: string;
  createdAt: string;
  author: NodeAuthor;
  mergeMap?: { fromNodeId: string; aspects: string[] }[];
  canvasId: string;
  schemaVersion: string;
}

export interface CanvasSummary {
  canvasId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  proseSummary: string;
  activeBranches: BranchSummary[];
  primaryBranchId?: string;
  pendingAssumptions: PendingAssumption[];
  recentDecisions: DecisionSummary[];
  activeChallenges: ChallengeSummary[];
  healthMetrics: {
    freshNodes: number;
    matureNodes: number;
    staleNodes: number;
    negatedNodes: number;
    orphanedNodes: number;
  };
  participants: NodeAuthor[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    factCount: number;
    decisionCount: number;
    questionCount: number;
  };
  lastGeneratedAt: string;
}

export interface BranchSummary {
  nodeId: string;
  title: string;
  nodeCount: number;
  status: 'active' | 'resolved' | 'abandoned' | 'merged';
  lastActivityAt: string;
  summary?: string;
}

export interface PendingAssumption {
  nodeId: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  dependedOnBy: string[];
}

export interface DecisionSummary {
  nodeId: string;
  title: string;
  rationale: string;
  decidedAt: string;
}

export interface ChallengeSummary {
  targetNodeId: string;
  challengerNodeId: string;
  description: string;
  addressed: boolean;
}

export interface FactsTable {
  canvasId: string;
  facts: Record<string, FactEntry>;
  lastRebuiltAt: string;
}

export interface FactEntry {
  key: string;
  label: string;
  value: unknown;
  unit?: string;
  staleness: 'current' | 'stale' | 'disputed';
  sources: string[];
  conflicts?: {
    nodeId: string;
    proposedValue: unknown;
    rationale?: string;
  }[];
  dependedOnBy: string[];
  updatedAt: string;
  updatedBy: NodeAuthor;
}

export interface Canvas {
  id: string;
  name: string;
  description?: string;
  author: NodeAuthor;
  createdAt: string;
  updatedAt: string;
  viewport?: {
    focusedNodeId: string;
    zoom: number;
    center: { x: number; y: number };
    timeSlice?: string;
  };
  participants: NodeAuthor[];
  tags: string[];
  schemaVersion: string;
  summary?: CanvasSummary;
  factsTable?: FactsTable;
}

export interface TemporalSnapshot {
  timestamp: string;
  changedNodes: string[];
  changedEdges: string[];
  delta: {
    nodes: InosNode[];
    edges: InosEdge[];
  };
}

export interface InosGraph {
  schemaVersion: string;
  canvas: Canvas;
  nodes: InosNode[];
  edges: InosEdge[];
  temporalIndex: TemporalSnapshot[];
  factRegistry: Record<string, string[]>;
  summary?: CanvasSummary;
  factsTable?: FactsTable;
}
