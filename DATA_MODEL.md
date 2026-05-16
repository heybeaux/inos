# Inos Data Model

**Status:** Draft v0.1 — 2026-05-16, Cirrus ☁️ + Beaux Walton  
**Scope:** Canonical types for the Inos 4D reasoning graph

---

## Design Principles

1. **Everything is a node.** Every thought, decision, fact, question, deliberation outcome, and synthesis is a node in the graph.
2. **Edges are typed relationships.** Not just "connected to" — supports, challenges, refines, diverges, merges, depends on.
3. **Time is first-class.** Every node and edge carries temporal metadata. The graph is a snapshot at any point in time.
4. **Facts are traceable.** Every claim has provenance. When a fact changes, dependent nodes cascade.
5. **Sonder-signed.** Every node is a signable artifact. The audit trail is cryptographic, not implicit.
6. **Additive contract.** New fields extend existing types. Old readers ignore new fields. Nothing breaks on version bump.
7. **Ecosystem-native.** Lattice State Contracts, Parliament deliberations, Engram memories, ACR capabilities — all map into Inos nodes natively.

---

## Core Types

### InosNode

The fundamental unit of the reasoning graph.

```typescript
export type NodeType =
  | 'claim'        // A statement or assertion
  | 'question'     // An open inquiry
  | 'decision'     // A concluded choice with rationale
  | 'evidence'     // Data, facts, references, citations
  | 'branch'       // A divergent path from a parent
  | 'synthesis'    // A merge of multiple branches
  | 'deliberation' // A Parliament run embedded in the graph
  | 'constraint'   // A limiting factor or requirement
  | 'assumption'   // Something taken as true without proof
  | 'insight'      // Meta-reasoning observation about the graph
  | 'artifact'     // External content (doc, code, image, link)
  | 'fact'         // A verified, propagating datum;
```

```typescript
export interface InosNode {
  /** ULID — globally unique, time-ordered. */
  id: string;

  /** Node type discriminator. */
  type: NodeType;

  /** Human-readable title (1-3 words). Auto-generated for AI-created nodes. */
  title: string;

  /**
   * Node content. Type depends on node:
   *   - claim/decision/insight: string (prose)
   *   - evidence: { source: string; excerpt?: string; url?: string }
   *   - deliberation: { parliamentId: string; topic: string; preset: string }
   *   - artifact: { mimeType: string; url: string; preview?: string }
   *   - fact: { value: unknown; unit?: string; verifiedAt?: string }
   */
  content: NodeContent;

  /**
   * Author of this node. Can be human or agent.
   * Human: { type: 'human', userId: string, displayName: string }
   * Agent: { type: 'agent', agentId: string, model: string }
   * System: { type: 'system', source: string }  // e.g. "transcript-ingestion"
   */
  author: NodeAuthor;

  /** ISO 8601 timestamp when this node was created. */
  createdAt: string;

  /** ISO 8601 timestamp of last modification. */
  updatedAt: string;

  /**
   * Temporal visit log. Every time a user/agent revisits this node,
   * a visit record is appended. Powers the "what changed since you
   * were last here" feature.
   */
  visits: VisitRecord[];

  /**
   * Lattice State Contract reference. For decision and claim nodes,
   * this links to the StateContract that was emitted when the node
   * was created or last updated. Carries inputs, decisions, outputs,
   * constraints, assumptions, and budget.
   *
   * This is the audit trail integration point.
   */
  stateContractId?: string;

  /**
   * Fact dependencies. For nodes whose truth depends on other nodes
   * (typically evidence or fact nodes). When a dependency changes,
   * this node's staleness is recalculated.
   *
   * E.g., a decision node that cites "API limit: 100/min" has a
   * dependency on the fact node containing that limit.
   */
  dependsOn: string[];  // node IDs

  /**
   * Staleness state. Updated by the cascade engine when dependencies change.
   */
  staleness: StalenessInfo;

  /**
   * Sonder signing info. When this node is signed (optional, but
   * required for decisions and evidence nodes in team contexts),
   * carries the ed25519 signature and governance block.
   */
  signature?: SonderSignature;

  /**
   * Engram memory reference. For nodes created from or backed by
   * Engram memories, this links to the source memory.
   */
  engramMemoryId?: string;

  /**
   * ACR capability context. For agent-authored nodes, this records
   * what capabilities the agent had active when creating the node.
   */
  agentCapabilities?: string[];  // ACR capability IDs

  /**
   * Canvas ID. The canvas this node belongs to. A node belongs to
   * exactly one canvas (no cross-canvas nodes; cross-canvas links
   * are edges of type 'references').
   */
  canvasId: string;

  /**
   * Lifecycle status.
   */
  status: NodeStatus;

  /**
   * Tags / labels for filtering and grouping. Free-form.
   */
  tags: string[];

  /**
   * Schema version for this node. Enables additive evolution.
   */
  schemaVersion: string;
}
```

### Edge Types

```typescript
export type EdgeType =
  | 'supports'      // Source strengthens Target
  | 'challenges'    // Source disputes Target
  | 'refines'       // Source adds nuance/detail to Target
  | 'diverges'      // Source explores alternative to Target
  | 'merges'        // Source synthesizes multiple targets
  | 'depends_on'    // Source requires Target's truth
  | 'references'    // Loose connection — related but not dependent
  | 'temporal'      // This node is a temporal revisit of Target
  | 'replaces'      // Supersedes Target (Target becomes stale)
  | 'inherits';     // Inherits properties from Target (fact propagation)
```

```typescript
export interface InosEdge {
  /** ULID */
  id: string;

  /** Edge type discriminator. */
  type: EdgeType;

  /** Source node ID. */
  sourceId: string;

  /** Target node ID. */
  targetId: string;

  /** Optional label shown on the edge in the UI. */
  label?: string;

  /** ISO 8601 creation time. */
  createdAt: string;

  /** Author who created this edge. */
  author: NodeAuthor;

  /**
   * For 'merges' edges: which aspects of each target were incorporated.
   * Enables side-by-side synthesis visualization.
   */
  mergeMap?: { fromNodeId: string; aspects: string[] }[];

  /** Canvas ID. */
  canvasId: string;

  /** Schema version. */
  schemaVersion: string;
}
```

### Canvas

A canvas is a named, bounded reasoning space. One project, one decision, one exploration.

```typescript
export interface Canvas {
  /** ULID */
  id: string;

  /** Human-readable name. */
  name: string;

  /** Optional description. */
  description?: string;

  /** Creator. */
  author: NodeAuthor;

  /** ISO 8601 creation time. */
  createdAt: string;

  /** ISO 8601 of last modification (any node or edge change). */
  updatedAt: string;

  /**
   * Current viewport state — what the user was looking at.
   * Saved for "resume where you left off."
   */
  viewport?: {
    focusedNodeId: string;
    zoom: number;
    center: { x: number; y: number };
    timeSlice?: string;  // ISO date for temporal view
  };

  /**
   * Active participants. Who is currently collaborating on this canvas.
   * Humans + agents.
   */
  participants: NodeAuthor[];

  /**
   * Tags for canvas-level organization.
   */
  tags: string[];

  /**
   * Schema version.
   */
  schemaVersion: string;

  /**
   * Cached canvas summary. Regenerated automatically on significant
   * canvas changes. Present when at least one LLM summary has run.
   */
  summary?: CanvasSummary;

  /**
   * Cached facts table. Rebuilt when fact-type nodes are added,
   * updated, or deduplicated.
   */
  factsTable?: FactsTable;
}
```

### Supporting Types

```typescript
export type NodeStatus =
  | 'fresh'        // Recently created or updated, active
  | 'mature'       // Settled, resolved, stable
  | 'dormant'      // Not active for N days, preserved
  | 'stale'        // Dependency changed, needs review
  | 'negated'      // Foundational assumption collapsed
  | 'orphaned';    // Parent node no longer exists/valid

export interface StalenessInfo {
  /** Current staleness state. */
  state: 'fresh' | 'stale' | 'negated' | 'orphaned';

  /** Why this node is stale/negated/orphaned (if applicable). */
  reason?: string;

  /** ID of the dependency that changed, triggering this state. */
  triggeredBy?: string;  // node ID

  /** When staleness was last evaluated. */
  evaluatedAt: string;

  /**
   * Cascade depth — how many hops away from the changed fact.
   * 0 = the changed fact itself. 1 = direct dependent. 2+ = transitive.
   */
  cascadeDepth: number;
}

export interface VisitRecord {
  /** Who visited. */
  visitor: NodeAuthor;

  /** When. */
  at: string;

  /** What they did: read, edited, branched_from, merged_into */
  action: 'read' | 'edit' | 'branch' | 'merge';
}

export interface SonderSignature {
  /** ed25519 signature of the canonicalized node. */
  signature: string;

  /** Public key of the signer. */
  publicKey: string;

  /**
   * Governance block from the SonderEvent.
   * Mirrors SonderEvent.governance structure.
   */
  governance: {
    tier: string;        // e.g. "L0", "L0+L1", "L0+L1+L2"
    evidence: unknown[]; // PolicyEvidenceRow[] from Lattice L0
    policyRuleSetId?: string;
    policyRuleSetVersion?: string;
  };

  /** ISO 8601 signing time. */
  signedAt: string;

  /**
   * The canonicalized node hash that was signed.
   * Enables verification: hash(node) === signedHash.
   */
  signedHash: string;
}
```

---

## Ecosystem Integration Mapping

### Lattice → Inos

| Lattice Concept | Inos Mapping |
|----------------|-------------|
| `StateContract` | `InosNode.stateContractId` — decision/claim nodes reference the contract |
| `Decision[]` | Becomes `InosNode.content` for decision-type nodes |
| `Constraint[]` | Becomes constraint-type nodes, or `InosNode.content` for constraint-type |
| `Assumption[]` | Becomes assumption-type nodes |
| `ValidationResult` | Stored as edge metadata on the validation edge |
| `PolicyEvidenceRow[]` | Embedded in `SonderSignature.governance.evidence` |
| Circuit breaker state | Stored as a system node on the canvas |

### Parliament → Inos

| Parliament Concept | Inos Mapping |
|-------------------|-------------|
| `DeliberationResult` | A deliberation-type node with `content.parliamentId` linking to the result |
| `Turn[]` | Child nodes of the deliberation node, one per turn |
| `Conflict[]` | Challenge edges between turn nodes |
| `SplitSummary` | Divergence edges from the deliberation node |
| `SynthesizerMeta` | Content on the synthesis child node |
| `Blackboard` | The deliberation node IS the blackboard; its children are the turns |
| `SystemEvent[]` | System-type nodes on the canvas, linked to the deliberation |
| Topology preset | Stored in `content.preset` on the deliberation node |

### Engram → Inos

| Engram Concept | Inos Mapping |
|---------------|-------------|
| Memory (any layer) | `InosNode.engramMemoryId` — evidence/insight nodes reference memories |
| Dream cycle output | System-generated insight nodes |
| Dedup result | Edge of type 'replaces' between deduplicated nodes |
| Episodic recall | Source nodes created from recall results |

### ACR → Inos

| ACR Concept | Inos Mapping |
|------------|-------------|
| Capability manifest | `InosNode.agentCapabilities[]` on agent-authored nodes |
| Skill resolution | Stored as metadata on deliberation nodes (what skills were available) |
| LOD context | Edge metadata on edges between agent nodes |

### Sonder → Inos

| Sonder Concept | Inos Mapping |
|---------------|-------------|
| `SonderEvent` | Every signed node IS a SonderEvent. The node IS the event. |
| ed25519 signing | `InosNode.signature` — optional but required for decisions/evidence in team mode |
| Governance block | `SonderSignature.governance` — mirrors SonderEvent.governance |
| Sign refusal invariant | Nodes claiming L1+ governance tier MUST have L0 evidence rows |
| `redactJson` | Applied before sending node content to L2/L3 providers |

### AWM → Inos

| AWM Concept | Inos Mapping |
|------------|-------------|
| Prediction protocol | Stored as metadata on nodes (what was predicted vs. what happened) |
| Workflow state | Canvas-level metadata |

## Canvas Summary

The canvas summary is a **living dashboard** — a scannable overview of the canvas's current state. Users shouldn't have to explore the graph to understand what's going on. The summary surfaces the shape at a glance.

```typescript
export interface CanvasSummary {
  /** Canvas ID this summary describes. */
  canvasId: string;

  /** Generated from Canvas.name. */
  name: string;

  /** Generated from Canvas.description. */
  description?: string;

  /** ISO 8601 creation time. */
  createdAt: string;

  /** ISO 8601 of last modification. */
  updatedAt: string;

  /**
   * LLM-generated prose summary of the canvas.
   * "This canvas explores whether to migrate from PostgreSQL to Supabase.
   * Three branches exist: (1) full migration, (2) hybrid approach, (3) stay put.
   * The hybrid branch is currently most active. Two key assumptions remain
   * unresolved..."
   *
   * Regenerated on significant canvas changes (new branch, resolved decision,
   * fact cascade). Cached between regenerations.
   */
  proseSummary: string;

  /**
   * Active branches — top-level divergent paths from the root topic.
   * Each entry includes the branch root node ID, a short title,
   * current status, and activity level.
   */
  activeBranches: BranchSummary[];

  /**
   * The primary branch — the branch with the most recent activity
   * or the most nodes, depending on configuration. This is the
   * "current" line of thought.
   */
  primaryBranchId?: string;  // node ID (branch-type)

  /**
   * Pending assumptions — assumption-type nodes that haven't been
   * resolved (validated or rejected). These are open questions that
   * decisions depend on.
   */
  pendingAssumptions: PendingAssumption[];

  /**
   * Recent decisions — the last N decision-type nodes, with their
   * rationale summarized. Gives a quick sense of what's been decided.
   */
  recentDecisions: DecisionSummary[];

  /**
   * Active challenges — claim/decision nodes that have unresolved
   * challenge edges pointing at them. These are live disagreements.
   */
  activeChallenges: ChallengeSummary[];

  /**
   * Stale/negated nodes count. Quick health indicator.
   */
  healthMetrics: {
    freshNodes: number;
    matureNodes: number;
    staleNodes: number;
    negatedNodes: number;
    orphanedNodes: number;
  };

  /**
   * Participant list — who has contributed to this canvas.
   */
  participants: NodeAuthor[];

  /**
   * Total node and edge counts.
   */
  stats: {
    totalNodes: number;
    totalEdges: number;
    factCount: number;
    decisionCount: number;
    questionCount: number;
  };

  /**
   * When the summary was last regenerated.
   */
  lastGeneratedAt: string;
}

export interface BranchSummary {
  /** The branch root node ID. */
  nodeId: string;
  /** Auto-generated or user-provided title. */
  title: string;
  /** Number of nodes in this branch (including descendants). */
  nodeCount: number;
  /** Status of the branch. */
  status: 'active' | 'resolved' | 'abandoned' | 'merged';
  /** How recently this branch was active. */
  lastActivityAt: string;
  /** Short summary of what this branch explores. */
  summary?: string;
}

export interface PendingAssumption {
  /** The assumption node ID. */
  nodeId: string;
  /** The assumption's description/content. */
  description: string;
  /** Risk level from the assumption. */
  riskLevel: 'low' | 'medium' | 'high';
  /** Which decision nodes depend on this assumption. */
  dependedOnBy: string[];  // decision node IDs
}

export interface DecisionSummary {
  /** The decision node ID. */
  nodeId: string;
  /** Short title. */
  title: string;
  /** One-line rationale. */
  rationale: string;
  /** When decided. */
  decidedAt: string;
}

export interface ChallengeSummary {
  /** The node being challenged. */
  targetNodeId: string;
  /** The node doing the challenging. */
  challengerNodeId: string;
  /** Short description of the challenge. */
  description: string;
  /** Whether the challenge has been addressed. */
  addressed: boolean;
}
```

The summary is **regenerated automatically** by an LLM (or Parliament) when:
- A new branch is created
- A decision is resolved
- A fact cascade triggers
- The canvas is opened after a period of inactivity

It can also be **regenerated on demand** — "summarize where we are."

---

## Facts Table

The facts table is a **deduplicated, canonical view of all facts** on the canvas. Instead of clicking through 100 nodes to find out what the current API rate limit is, you open the facts panel and see it instantly.

```typescript
export interface FactsTable {
  /** Canvas ID this table belongs to. */
  canvasId: string;

  /**
   * Canonical facts, keyed by their stable fact key.
   * Each entry represents the current believed value.
   */
  facts: Record<string, FactEntry>;

  /** When this table was last rebuilt. */
  lastRebuiltAt: string;
}

export interface FactEntry {
  /** The stable fact key (e.g., "api_rate_limit"). */
  key: string;

  /** Human-readable label (e.g., "API Rate Limit"). */
  label: string;

  /** The current believed value. */
  value: unknown;

  /** Optional unit (e.g., "requests/minute", "USD"). */
  unit?: string;

  /** Staleness state of this fact. */
  staleness: 'current' | 'stale' | 'disputed';

  /**
   * Source node IDs — which fact-type nodes support this value.
   * Multiple sources = agreement. Conflicting sources = disputed.
   */
  sources: string[];  // fact-type node IDs

  /**
   * If disputed: which nodes disagree and what values they propose.
   */
  conflicts?: {
    nodeId: string;
    proposedValue: unknown;
    rationale?: string;
  }[];

  /**
   * Which nodes depend on this fact.
   * Used for cascade visualization from the facts panel.
   */
  dependedOnBy: string[];  // node IDs

  /** When this fact was last updated. */
  updatedAt: string;

  /** Who last updated it. */
  updatedBy: NodeAuthor;
}
```

### How the Facts Table Works

1. **Built from fact-type nodes.** The table aggregates all nodes of type `'fact'` on the canvas.
2. **Deduplication.** Nodes describing the same fact (detected by title similarity, LLM matching, or explicit `factKey` assignment) are merged into one entry with multiple sources.
3. **Conflict detection.** If two sources propose different values, the fact is marked `'disputed'` and the conflicts array shows the competing values.
4. **Cascade awareness.** The `dependedOnBy` array shows every node that depends on this fact — click to see what breaks if the fact changes.
5. **Visual priority.** Facts with many dependents or disputed status are surfaced at the top. Fresh facts pulse. Stale facts dim.

### Facts Table UI

The facts panel is a **sidebar or overlay** — always accessible from any canvas view:

```
┌─────────────────────────────────────┐
│  FACTS (14)              [+ Add]   │
├─────────────────────────────────────┤
│ 🔴 API Rate Limit     DISPUTED     │
│    100/min vs 1000/min (2 sources) │
│    → 7 nodes depend on this        │
│                                    │
│ 🟢 Budget              $50k/mo     │
│    1 source, 3 dependents          │
│                                    │
│ 🟡 Launch Date         Jun 1       │
│    2 sources, 5 dependents         │
│    Updated 2h ago by Trevan        │
│                                    │
│ 🟢 Team Size           6 people    │
│    1 source, 2 dependents          │
└─────────────────────────────────────┘
```

---

## Graph Serialization Format

The canonical graph format is a JSON document with three top-level arrays:

```typescript
export interface InosGraph {
  /** Schema version for the entire graph. */
  schemaVersion: string;

  /** Canvas this graph represents. */
  canvas: Canvas;

  /** All nodes in the canvas. */
  nodes: InosNode[];

  /** All edges in the canvas. */
  edges: InosEdge[];

  /**
   * Temporal index. Maps ISO date strings to graph snapshots.
   * Enables "show me the canvas as it was on 2026-05-16."
   * Snapshots are differential — only changed nodes/edges are stored.
   */
  temporalIndex: TemporalSnapshot[];

  /**
   * Fact registry. All fact-type nodes indexed by their key,
   * for fast dependency resolution and cascade computation.
   */
  factRegistry: Record<string, string[]>;  // fact key → node IDs

  /**
   * Canvas summary — the living dashboard.
   * Optional: can be regenerated on demand.
   */
  summary?: CanvasSummary;

  /**
   * Facts table — deduplicated canonical facts.
   * Optional: can be rebuilt on demand.
   */
  factsTable?: FactsTable;
}

export interface TemporalSnapshot {
  /** ISO 8601 timestamp of this snapshot. */
  timestamp: string;

  /** Node IDs that were created or modified at this time. */
  changedNodes: string[];

  /** Edge IDs that were created or modified at this time. */
  changedEdges: string[];

  /**
   * Differential payload. Only the changed nodes/edges,
   * not the full graph. Full reconstruction replays from
   * the first snapshot forward.
   */
  delta: {
    nodes: InosNode[];
    edges: InosEdge[];
  };
}
```

---

## Cascade Algorithm (Fact Propagation)

When a fact node is updated, the cascade engine walks the dependency graph:

```
1. Find all nodes with dependsOn containing the changed fact's ID.
2. For each dependent node:
   a. Re-evaluate the node's truth given the new fact value.
   b. Update staleness state:
      - If still valid but value changed → 'stale' (needs review)
      - If now invalid → 'negated' (assumption collapsed)
      - If parent deleted → 'orphaned'
   c. Record cascadeDepth = parent.cascadeDepth + 1
   d. Enqueue for further cascade (transitive dependencies)
3. Repeat until no more dependents are affected.
4. Update visual state for all affected nodes.
```

The cascade is synchronous for small graphs (<1000 nodes) and can be batched for larger ones.

---

## Resolved Decisions

1. **Node content → discriminated union.** Type-safe, compiler catches mistakes, IDE autocomplete. Custom node types can use `contentSchema` field later.
2. **Real-time collab → CRDT (Yjs).** Conflict-free by design, works offline, mature ecosystem. Graph size makes overhead negligible.
3. **Fact key generation → composite key from title + type + author.** Stable identifier independent of value. LLM-generated `factKey` for imported content.
4. **Snapshot frequency → every change, differential.** Perfect temporal resolution, storage is cheap, core to the product. Can compress old snapshots later.
5. **Cross-canvas references → via 'references' edges only.** Nodes belong to one canvas; edges link across canvases. Like hyperlinks.
6. **Deletion → soft delete (tombstone) always.** Nothing is lost. Tombstones are invisible in active view but queryable, recoverable, and visible to cascade engine.

## Open Questions

1. **Canvas summary regeneration trigger** — what counts as "significant" enough to regenerate? Any new node, or threshold-based (e.g., every 5 changes)?
2. **Facts table dedup strategy** — LLM-based matching, title similarity (edit distance), or explicit user grouping?
3. **Primary branch selection** — most recent activity, most nodes, or configurable (user picks which branch is "primary")?
4. **Fact disputations** — when two sources disagree, do we show both values equally, or weight by source credibility/verification status?
5. **Summary storage** — store as a field on the Canvas, or as a separate node type that's generated on demand?
6. **Facts table UI** — sidebar, overlay, or dedicated view? Or all three with different density?

---

*Last updated: 2026-05-16, Cirrus ☁️*
