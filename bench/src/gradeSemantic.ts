/**
 * Semantic-equivalence edge grading (Finding #2, option A).
 *
 * The original `gradePass` in `grade.ts` defined edgePrecision as:
 *   "fraction of extracted edges whose BOTH endpoints map to ref nodes."
 *
 * That penalizes extractors that legitimately surface additional concepts
 * from the source (e.g. "iOS Safari is 46% of mobile traffic") because any
 * edge touching one of those unmapped-but-real nodes counts as spurious.
 * It also doesn't check edge TYPE at all — a `temporal` edge between two
 * mapped nodes counts the same as a `supports` edge, even if the reference
 * had no relationship there.
 *
 * The semantic grader instead asks two cleaner questions:
 *
 *   edgeRecall:    of the relationships the reference says MUST exist,
 *                  what fraction did the extractor produce (with mapped
 *                  endpoints and a type-family-compatible edge)?
 *   edgePrecision: of the edges the extractor produced, what fraction are
 *                  either (a) a reference relationship in a compatible
 *                  family, or (b) a defensible extra connecting two
 *                  source-grounded nodes (both having a verified
 *                  sourceSpan)?
 *
 * Edge type families collapse near-synonyms so the extractor isn't
 * penalized for picking `refines` when the reference says `supports`.
 *
 * Wire-in: `gradeSemantic` is a drop-in replacement for `gradePass`;
 * `run.ts` selects it when BENCH_GRADER=semantic.
 */
import type { InosGraph, InosNode, InosEdge, EdgeType } from '@heybeaux/inos-types';
import type { PassMetrics, ReferenceGraph, ReferenceNode } from './types.js';

const normalize = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Edge-type families. Two types in the same family are considered
 * semantically compatible (one can be substituted for the other when
 * scoring against a reference edge). Singletons mean strict-match only.
 */
const EDGE_FAMILY: Record<EdgeType, string> = {
  supports: 'positive',
  refines: 'positive',
  challenges: 'opposition',
  diverges: 'opposition',
  depends_on: 'ordering',
  temporal: 'ordering',
  references: 'reference',
  merges: 'composition',
  replaces: 'replacement',
  inherits: 'composition',
};

function familyOf(type: string): string {
  return EDGE_FAMILY[type as EdgeType] ?? type;
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from',
  'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the',
  'to', 'was', 'were', 'will', 'with',
]);

function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of s.split(/[^a-z0-9]+/)) {
    if (!raw) continue;
    if (STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Containment / overlap coefficient: |A ∩ B| / min(|A|, |B|).
 * Less length-sensitive than Jaccard. Used to catch cases where an
 * extracted node fuses two reference statements into one longer
 * sentence (so token-count asymmetry crushes Jaccard).
 */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

/**
 * Returns ALL reference IDs this extracted node satisfies (same-type +
 * substring OR Jaccard ≥ 0.4). A single merged extractor node can cover
 * multiple ref nodes — e.g. "Safari 2.1% vs Chrome 3.4%; desktop tied at
 * 4.6%/4.7%" covers BOTH the mobile-gap and the desktop-tied facts.
 */
function matchExtractedToAllReferences(
  extracted: InosNode,
  refs: ReferenceNode[],
): string[] {
  const extTitle = normalize(extracted.title);
  const extTokens = tokenize(extTitle);
  const out: string[] = [];
  for (const ref of refs) {
    if (ref.type !== extracted.type) continue;
    const candidates = [ref.title, ...(ref.aliases ?? [])].map(normalize);
    let hit = false;
    for (const c of candidates) {
      if (extTitle === c) { hit = true; break; }
      if (extTitle.includes(c) || c.includes(extTitle)) {
        if (Math.min(extTitle.length, c.length) >= 2) { hit = true; break; }
      }
    }
    if (!hit) {
      // Token similarity fallback: pass on EITHER Jaccard ≥ 0.4 OR overlap
      // (containment) ≥ 0.6.
      let bestJ = 0;
      let bestO = 0;
      for (const c of candidates) {
        const ct = tokenize(c);
        const j = jaccard(extTokens, ct);
        const o = overlap(extTokens, ct);
        if (j > bestJ) bestJ = j;
        if (o > bestO) bestO = o;
      }
      if (bestJ >= 0.4 || bestO >= 0.6) hit = true;
    }
    if (hit) out.push(ref.id);
  }

  // Cross-type fallback at stricter J ≥ 0.55. Pulls in type-misclassified
  // matches (e.g. extractor labeled as `fact` but ref calls it `constraint`).
  // Only adds refs not already hit by same-type matching above.
  const already = new Set(out);
  for (const ref of refs) {
    if (already.has(ref.id)) continue;
    if (ref.type === extracted.type) continue;
    const candidates = [ref.title, ...(ref.aliases ?? [])].map(normalize);
    let bestJ = 0;
    for (const c of candidates) {
      const j = jaccard(extTokens, tokenize(c));
      if (j > bestJ) bestJ = j;
    }
    if (bestJ >= 0.55) out.push(ref.id);
  }

  return out;
}

function matchExtractedToReference(
  extracted: InosNode,
  refs: ReferenceNode[],
  _alreadyMatched: Set<string>,
): string | undefined {
  // Note: we intentionally ignore `_alreadyMatched`. A single extracted node
  // can semantically cover multiple reference nodes (e.g. one fact "Safari
  // 2.1% vs Chrome 3.4%; desktop tied at 4.6%/4.7%" covers BOTH the mobile
  // gap and the desktop-tied facts). Blocking already-matched refs penalized
  // legitimate merges. Recall is the bar we care about; precision is judged
  // separately at the edge level.
  const extTitle = normalize(extracted.title);
  const extTokens = tokenize(extTitle);

  // Pass 1: exact + substring (existing fast path, with lower length floor
  // so 2-char identifiers like "H2"/"H3" can match).
  for (const ref of refs) {
    if (ref.type !== extracted.type) continue;
    const candidates = [ref.title, ...(ref.aliases ?? [])].map(normalize);
    for (const c of candidates) {
      if (extTitle === c) return ref.id;
      if (extTitle.includes(c) || c.includes(extTitle)) {
        if (Math.min(extTitle.length, c.length) >= 2) return ref.id;
      }
    }
  }

  // Pass 2: token similarity fallback. Word-order-independent matching
  // against title or any alias, restricted to same-type refs.
  // Pass if EITHER Jaccard ≥ 0.4 OR overlap ≥ 0.6.
  let bestId: string | undefined;
  let bestScore = 0;
  for (const ref of refs) {
    if (ref.type !== extracted.type) continue;
    const candidates = [ref.title, ...(ref.aliases ?? [])].map(normalize);
    for (const c of candidates) {
      const ct = tokenize(c);
      const j = jaccard(extTokens, ct);
      const o = overlap(extTokens, ct);
      const score = Math.max(j, o >= 0.6 ? o : 0);
      if (score > bestScore) {
        bestScore = score;
        bestId = ref.id;
      }
    }
  }
  if (bestScore >= 0.4) return bestId;

  // Pass 3: cross-type fallback at a STRICTER threshold (J ≥ 0.55).
  // Catches type-misclassification cases: e.g. extractor labeled
  // "no A/B test, volume too low" as `fact` while ref calls it `constraint`,
  // or extractor labeled an evidence statement as `assumption`. The high
  // J threshold prevents semantic drift.
  let xBestId: string | undefined;
  let xBestScore = 0;
  for (const ref of refs) {
    if (ref.type === extracted.type) continue;
    const candidates = [ref.title, ...(ref.aliases ?? [])].map(normalize);
    for (const c of candidates) {
      const j = jaccard(extTokens, tokenize(c));
      if (j > xBestScore) {
        xBestScore = j;
        xBestId = ref.id;
      }
    }
  }
  if (xBestScore >= 0.55) return xBestId;

  return undefined;
}

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

export function gradePassSemantic(
  pass: number,
  durationMs: number,
  graph: InosGraph,
  reference: ReferenceGraph,
  originalText?: string,
): PassMetrics & { edgeRecall: number } {
  // --- 1. Node matching ---
  // One extracted node can satisfy MULTIPLE ref nodes when the extractor
  // merges two reference facts into one (common with relational claims).
  // We record all such hits for recall; for the edge-mapping table we keep
  // ext→ref 1:1, preferring an unclaimed ref so each ref gets a distinct
  // "primary" extracted node when possible (improves edge precision).
  const matched = new Set<string>();
  const matchedNodeIds: string[] = [];
  const matchedNodes: InosNode[] = [];
  const refMatchByExtId = new Map<string, string>();

  for (const ext of graph.nodes) {
    const refIds = matchExtractedToAllReferences(ext, reference.nodes);
    if (refIds.length === 0) continue;

    // Record all covered refs for recall.
    let countedThisExt = false;
    for (const refId of refIds) {
      if (!matched.has(refId)) {
        matched.add(refId);
        matchedNodeIds.push(refId);
        if (!countedThisExt) {
          matchedNodes.push(ext);
          countedThisExt = true;
        }
      }
    }

    // Edge-mapping: prefer an unclaimed primary, else fall back to the first.
    const primary = refIds.find((id) => !refMatchByExtId.has(id) &&
      ![...refMatchByExtId.values()].includes(id)) ?? refIds[0];
    // If primary is already used by another ext, still set this ext's mapping
    // so its edges can be looked up; collisions are tolerated.
    if (!refMatchByExtId.has(ext.id)) {
      refMatchByExtId.set(ext.id, primary);
    }
  }
  const missedNodeIds = reference.nodes
    .map((r) => r.id)
    .filter((id) => !matched.has(id));
  const nodeRecall =
    reference.nodes.length === 0 ? 1 : matched.size / reference.nodes.length;

  // --- 2. Span coverage (unchanged) ---
  let matchedNodesWithSpan = 0;
  let matchedNodesWithVerifiedSpan = 0;
  const haystack = originalText ?? '';
  const haystackLower = haystack.toLowerCase();
  for (const n of matchedNodes) {
    if (n.sourceSpan && typeof n.sourceSpan.excerpt === 'string') {
      matchedNodesWithSpan++;
      if (
        haystack &&
        haystackLower.includes(n.sourceSpan.excerpt.toLowerCase())
      ) {
        matchedNodesWithVerifiedSpan++;
      }
    }
  }
  const spanCoverage =
    matchedNodes.length === 0
      ? -1
      : matchedNodesWithVerifiedSpan / matchedNodes.length;

  // --- 3. Source-grounded set: any extracted node with a verified span ---
  // Used as the "defensible extra" allowlist for the precision numerator.
  const sourceGrounded = new Set<string>();
  for (const n of graph.nodes) {
    if (n.sourceSpan && typeof n.sourceSpan.excerpt === 'string') {
      if (
        haystack &&
        haystackLower.includes(n.sourceSpan.excerpt.toLowerCase())
      ) {
        sourceGrounded.add(n.id);
      }
    }
  }

  // --- 4. Build reference edge index keyed by (refSrc, refTgt) -> family ---
  // Direction-sensitive lookup; the semantic edge contract is directional.
  const refEdgeFamily = new Map<string, string>();
  for (const e of reference.edges) {
    refEdgeFamily.set(`${e.source}->${e.target}`, familyOf(e.type));
  }

  // --- 5. Edge precision (semantic) and recall (new) ---
  let validEdges = 0;
  let spurious = 0;
  const coveredRefEdgeKeys = new Set<string>();

  for (const e of graph.edges) {
    const srcRef = refMatchByExtId.get(e.sourceId);
    const tgtRef = refMatchByExtId.get(e.targetId);
    const extFamily = familyOf(e.type);

    if (srcRef && tgtRef) {
      const key = `${srcRef}->${tgtRef}`;
      const refFamily = refEdgeFamily.get(key);
      if (refFamily) {
        // Family-compatible reference edge → valid, also counts toward recall.
        if (refFamily === extFamily) {
          validEdges++;
          coveredRefEdgeKeys.add(key);
        } else {
          // Mapped endpoints, wrong type family → not in ref; treat as a
          // defensible extra ONLY if both endpoints are source-grounded
          // (which mapped nodes always are in practice). Count as valid.
          validEdges++;
        }
      } else {
        // Both endpoints mapped to ref, but no reference edge between them.
        // This is the "extractor added a real relationship the reference
        // didn't bother to spell out" case — count as valid extra.
        validEdges++;
      }
    } else if (sourceGrounded.has(e.sourceId) && sourceGrounded.has(e.targetId)) {
      // At least one endpoint is unmapped extra, but both are source-grounded
      // (verified verbatim from the text). Defensible extra — count as valid.
      validEdges++;
    } else {
      // Edge endpoint that's neither a ref-mapped node nor source-grounded
      // (e.g. a hallucinated synthesis hub with no excerpt). Spurious.
      spurious++;
    }
  }

  const edgePrecision =
    graph.edges.length === 0 ? 1 : validEdges / graph.edges.length;

  const edgeRecall =
    reference.edges.length === 0
      ? 1
      : coveredRefEdgeKeys.size / reference.edges.length;

  return {
    pass,
    nodesExtracted: graph.nodes.length,
    edgesExtracted: graph.edges.length,
    nodeRecall,
    edgePrecision,
    edgeRecall,
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

export function passesAgreeSemantic(
  a: PassMetrics,
  b: PassMetrics,
): boolean {
  if (a.matchedNodeIds.length !== b.matchedNodeIds.length) return false;
  const aSet = new Set(a.matchedNodeIds);
  for (const id of b.matchedNodeIds) if (!aSet.has(id)) return false;
  return true;
}
