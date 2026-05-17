import type { InosGraph, InosNode, InosEdge } from '@heybeaux/inos-types';
import type { PassMetrics, ReferenceGraph, ReferenceNode } from './types.js';

const normalize = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Attempt to match an extracted node to a reference node by title/alias.
 * Returns the matched reference node id, or undefined.
 */
function matchExtractedToReference(
  extracted: InosNode,
  refs: ReferenceNode[],
  alreadyMatched: Set<string>,
): string | undefined {
  const extTitle = normalize(extracted.title);
  for (const ref of refs) {
    if (alreadyMatched.has(ref.id)) continue;
    if (ref.type !== extracted.type) continue;

    const candidates = [ref.title, ...(ref.aliases ?? [])].map(normalize);
    for (const c of candidates) {
      if (extTitle === c) return ref.id;
      if (extTitle.includes(c) || c.includes(extTitle)) {
        // Require ≥4 char overlap to avoid trivial substring noise
        if (Math.min(extTitle.length, c.length) >= 4) return ref.id;
      }
    }
  }
  return undefined;
}

/**
 * Lightweight schema validation — checks invariants the extractor must hold,
 * not full JSON-schema. Faster and catches the bugs we actually see.
 */
function isSchemaValid(graph: InosGraph): boolean {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return false;
  if (graph.nodes.length === 0) return false;

  const nodeIds = new Set<string>();
  for (const n of graph.nodes) {
    if (!n.id || !n.type || !n.title) return false;
    if (nodeIds.has(n.id)) return false;
    nodeIds.add(n.id);
    if (!Array.isArray(n.dependsOn)) return false;
    if (!n.staleness || typeof n.staleness.state !== 'string') return false;
  }
  for (const e of graph.edges) {
    if (!e.id || !e.type || !e.sourceId || !e.targetId) return false;
    if (!nodeIds.has(e.sourceId) || !nodeIds.has(e.targetId)) return false;
  }
  return true;
}

export function gradePass(
  pass: number,
  durationMs: number,
  graph: InosGraph,
  reference: ReferenceGraph,
): PassMetrics {
  const matched = new Set<string>();
  const matchedNodeIds: string[] = [];

  for (const ext of graph.nodes) {
    const refId = matchExtractedToReference(ext, reference.nodes, matched);
    if (refId) {
      matched.add(refId);
      matchedNodeIds.push(refId);
    }
  }

  const missedNodeIds = reference.nodes
    .map((r) => r.id)
    .filter((id) => !matched.has(id));

  const nodeRecall = reference.nodes.length === 0
    ? 1
    : matched.size / reference.nodes.length;

  // Edge precision: of edges the extractor emitted, what fraction connect a
  // pair of nodes that both matched reference nodes? (proxy for "real" edges)
  const refMatchByExtId = new Map<string, string>();
  // We need extracted-node-id -> matched-ref-id; redo the match keyed by extracted id
  const matched2 = new Set<string>();
  for (const ext of graph.nodes) {
    const refId = matchExtractedToReference(ext, reference.nodes, matched2);
    if (refId) {
      matched2.add(refId);
      refMatchByExtId.set(ext.id, refId);
    }
  }

  let validEdges = 0;
  let spurious = 0;
  for (const e of graph.edges) {
    const srcMatched = refMatchByExtId.has(e.sourceId);
    const tgtMatched = refMatchByExtId.has(e.targetId);
    if (srcMatched && tgtMatched) validEdges++;
    else spurious++;
  }
  const edgePrecision = graph.edges.length === 0
    ? 1
    : validEdges / graph.edges.length;

  return {
    pass,
    nodesExtracted: graph.nodes.length,
    edgesExtracted: graph.edges.length,
    nodeRecall,
    edgePrecision,
    schemaValid: isSchemaValid(graph),
    matchedNodeIds,
    missedNodeIds,
    spuriousEdgeCount: spurious,
    durationMs,
  };
}

/**
 * Structural determinism check: do two graphs have the same set of matched
 * reference-node ids? (Position / id-string variance is allowed.)
 */
export function passesAgree(a: PassMetrics, b: PassMetrics): boolean {
  if (a.matchedNodeIds.length !== b.matchedNodeIds.length) return false;
  const aSet = new Set(a.matchedNodeIds);
  for (const id of b.matchedNodeIds) if (!aSet.has(id)) return false;
  return true;
}
