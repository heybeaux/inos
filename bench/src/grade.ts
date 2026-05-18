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
  originalText?: string,
): PassMetrics {
  const matched = new Set<string>();
  const matchedNodeIds: string[] = [];
  const matchedNodes: InosNode[] = [];

  for (const ext of graph.nodes) {
    const refId = matchExtractedToReference(ext, reference.nodes, matched);
    if (refId) {
      matched.add(refId);
      matchedNodeIds.push(refId);
      matchedNodes.push(ext);
    }
  }

  const missedNodeIds = reference.nodes
    .map((r) => r.id)
    .filter((id) => !matched.has(id));

  const nodeRecall = reference.nodes.length === 0
    ? 1
    : matched.size / reference.nodes.length;

  // --- Span coverage: of matched nodes, weight by resolveStrategy honesty
  // (issue #19). Old grader scored ANY excerpt that happened to substring-
  // match as 1.0 — which double-counted fuzzy/approximate spans that the
  // sourceSpan resolver only kept because of a 20-char LCS coincidence. New
  // scoring:
  //   verbatim    -> 1.0   (exact or whitespace-normalized hit)
  //   approximate -> 0.5   (fuzzy ≥40-char or ≥80% needle coverage)
  //   unresolved  -> 0.0   (no sourceSpan, or no excerpt)
  // We fall back to the substring check ONLY when a span exists without a
  // resolveStrategy tag (legacy serializations from before this change).
  // ---
  let matchedNodesWithSpan = 0;
  let matchedNodesWithVerifiedSpan = 0; // verbatim + approximate combined
  let spanScore = 0;
  const haystack = originalText ?? '';
  const haystackLower = haystack.toLowerCase();
  for (const n of matchedNodes) {
    const span = n.sourceSpan as
      | (typeof n.sourceSpan & { resolveStrategy?: string })
      | undefined;
    if (span && typeof span.excerpt === 'string') {
      matchedNodesWithSpan++;
      const strategy = span.resolveStrategy;
      if (strategy === 'verbatim') {
        spanScore += 1.0;
        matchedNodesWithVerifiedSpan++;
      } else if (strategy === 'approximate') {
        spanScore += 0.5;
        matchedNodesWithVerifiedSpan++;
      } else if (strategy === 'unresolved') {
        // Tagged unresolved spans contribute zero (the resolver shouldn't
        // really return one in this state, but be defensive).
      } else {
        // Legacy / untagged span — fall back to substring check at half
        // credit, since we don't know whether it was an exact or fuzzy hit.
        if (haystack && haystackLower.includes(span.excerpt.toLowerCase())) {
          spanScore += 0.5;
          matchedNodesWithVerifiedSpan++;
        }
      }
    }
  }
  const spanCoverage =
    matchedNodes.length === 0 ? -1 : spanScore / matchedNodes.length;

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
    spanCoverage,
    matchedNodesWithSpan,
    matchedNodesWithVerifiedSpan,
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
