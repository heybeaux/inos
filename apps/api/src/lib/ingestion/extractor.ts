/**
 * Multi-pass LLM extraction for transcript ingestion.
 *
 * Pipeline overview:
 *   1. Pre-process raw text (clean formatting, detect format).
 *   2. Optionally chunk by structural boundaries when input ≥ CHUNK_THRESHOLD.
 *   3. For each chunk run a 3-pass extraction (spine → support → edges).
 *   4. If multiple chunks, run a consolidation pass to merge / dedupe.
 *   5. Run a Pass-4 recovery sweep on the merged result.
 *   6. Force-layout positions and construct InosGraph.
 *
 * Determinism: temperature=0.0 everywhere. The OpenRouter Sonnet-4-6 model
 * is not strictly seedable, but t=0 plus a stable system prompt + stable
 * input gets us ≥80% pass-pass determinism in practice (vs 40% at t=0.3).
 *
 * Model selection (rationale in code comments at each callsite):
 *   - Spine + Support + Edge passes: anthropic/claude-sonnet-4-6
 *     The reasoning quality of these passes is the dominant driver of
 *     nodeRecall / edgePrecision. Sonnet 4.6 reliably beats Haiku here.
 *   - Recovery + Consolidation passes: anthropic/claude-haiku-4-5-20251001
 *     These are mechanical diff / merge tasks. Haiku is ~12x cheaper and
 *     does fine on the structured comparison work.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  InosGraph,
  InosNode,
  InosEdge,
  NodeAuthor,
  Canvas,
} from '@heybeaux/inos-types';
import {
  buildSpinePrompt,
  buildSupportPrompt,
  buildEdgePrompt,
  buildRecoveryPrompt,
  buildConsolidationPrompt,
} from './prompts.js';
import { forceLayout } from './layout.js';
import {
  ExtractionSchemaError,
  validateExtractionResult,
  type ValidatedExtractionResult,
} from './schema.js';
import { resolveSourceSpan, emptyResolveStats } from './sourceSpan.js';
import type {
  InputFormat,
  ExtractionResult,
  ExtractedNode,
  ExtractedEdge,
  ExtractedNodeType,
  ExtractedEdgeType,
  IngestStats,
} from './types.js';

export { ExtractionSchemaError } from './schema.js';

// --- Configuration ---

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Default reasoning model. Locked to Sonnet 4.6 per user prefs
// (memory/feedback_opus_model_preference.md): Opus 4.7 has been a regression
// in practice, and Sonnet 4.6 is the strongest reliable Anthropic option
// for structured extraction at the time of writing.
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';

// Cheap validation / cleanup model. Haiku 4.5 is ~12x cheaper than Sonnet
// 4.6 on output tokens and fine for "find the missed nodes" diffing.
// (NOTE: OpenRouter expects `anthropic/claude-haiku-4.5`, not the
// dated form `claude-haiku-4-5-20251001` — those date-stamped IDs are the
// native Anthropic IDs and 400 on the OpenRouter gateway.)
const VALIDATION_MODEL = 'anthropic/claude-haiku-4.5';

// Inputs shorter than this don't benefit from chunking — the LLM context
// window dwarfs them and we'd lose cross-chunk coherence for no gain.
// Bench fixtures are 4–7k chars and reason cross-paragraph (replaces /
// challenges that span the whole journal), so we keep the threshold high
// enough that they stay single-chunk. Only genuinely long inputs (≥8k
// chars, e.g. a full meeting transcript) get chunked.
const CHUNK_THRESHOLD = 8000;

// Target chunk size when we DO chunk. Generous enough to keep most logical
// units intact and to amortize the per-chunk 3-pass overhead.
const CHUNK_TARGET = 6000;

function getOpenRouterKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

function getModel(configModel?: string): string {
  return configModel || process.env.INGESTION_MODEL || DEFAULT_MODEL;
}

function getValidationModel(): string {
  return process.env.INGESTION_VALIDATION_MODEL || VALIDATION_MODEL;
}

// --- Pre-processing ---

/**
 * Clean up the raw text: normalize whitespace, strip invisible characters.
 */
function preprocessText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width chars
    .replace(/\n{3,}/g, '\n\n') // collapse blank lines
    .trim();
}

/**
 * Try to auto-detect the input format from text patterns.
 */
export function detectFormat(text: string): InputFormat {
  const lines = text.split('\n');
  const first50 = lines.slice(0, 50).join('\n').toLowerCase();

  // Email indicators
  if (
    /^(From|To|Date|Subject|CC|BCC):/m.test(first50) ||
    /on .+ wrote:/i.test(first50) ||
    /> .+\n/g.test(first50)
  ) {
    return 'email';
  }

  // Slack/Teams indicators
  if (
    /^\[?\d{4}[-/]\d{2}[-/]\d{2}/m.test(first50) ||
    /<@U\w+>/i.test(first50) ||
    /^\w+ \w+:/m.test(first50) ||
    /reaction|emoji|👍|✅|❤️/.test(first50)
  ) {
    return 'slack';
  }

  // Meeting transcript indicators
  if (
    /\b\d{1,2}:\d{2}\s*[ap]m?\b/i.test(first50) ||
    /\[speaker|agenda|action item|minutes\b/i.test(first50)
  ) {
    return 'meeting';
  }

  return 'raw';
}

// --- Structural chunking ---

/**
 * Split long input on structural boundaries:
 *   1) markdown H1/H2 headers
 *   2) conversation turn markers ("User:" / "Assistant:" / "Speaker:")
 *   3) paragraph runs separated by 2+ blank lines
 *
 * Targets CHUNK_TARGET chars per chunk; merges small leading/trailing
 * fragments to avoid 1-line chunks.
 */
export function chunkText(text: string): string[] {
  if (text.length < CHUNK_THRESHOLD) return [text];

  // 1) Prefer markdown header splits if any exist.
  if (/^#{1,2} /m.test(text)) {
    const parts = text.split(/(?=^#{1,2} )/m).map((p) => p.trim()).filter(Boolean);
    return mergeSmallChunks(parts);
  }

  // 2) Prefer conversation turn splits if explicit speakers exist.
  if (/^(User|Assistant|AI|Human|System|Speaker[ \d]*):/m.test(text)) {
    const parts = text.split(/(?=^(?:User|Assistant|AI|Human|System|Speaker[ \d]*):)/m)
      .map((p) => p.trim())
      .filter(Boolean);
    return mergeSmallChunks(parts);
  }

  // 3) Fall back to paragraph-group splits.
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return mergeSmallChunks(paragraphs);
}

function mergeSmallChunks(parts: string[]): string[] {
  const merged: string[] = [];
  let buffer = '';
  for (const part of parts) {
    if (!buffer) {
      buffer = part;
      continue;
    }
    if (buffer.length + part.length + 2 <= CHUNK_TARGET) {
      buffer = `${buffer}\n\n${part}`;
    } else {
      merged.push(buffer);
      buffer = part;
    }
  }
  if (buffer) merged.push(buffer);
  // If a single chunk is still huge (single 8k-char paragraph), force-split by char count.
  const final: string[] = [];
  for (const c of merged) {
    if (c.length <= CHUNK_TARGET * 1.5) {
      final.push(c);
    } else {
      // Hard wrap on sentence boundaries where possible.
      const sentences = c.split(/(?<=[.!?])\s+/);
      let buf = '';
      for (const s of sentences) {
        if (buf.length + s.length + 1 > CHUNK_TARGET) {
          if (buf) final.push(buf);
          buf = s;
        } else {
          buf = buf ? `${buf} ${s}` : s;
        }
      }
      if (buf) final.push(buf);
    }
  }
  return final;
}

// --- LLM call ---

export class IngestionConfigError extends Error {
  readonly code = 'OPENROUTER_UNCONFIGURED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'IngestionConfigError';
  }
}

interface LLMCallOpts {
  prompt: string;
  model: string;
  /** Max output tokens. Sonnet 4.6 handles up to 8k comfortably. */
  maxTokens?: number;
  /** System prompt override. Default is the JSON-only contract. */
  systemPrompt?: string;
}

async function callLLM(opts: LLMCallOpts): Promise<string> {
  const { prompt, model, maxTokens = 6000 } = opts;
  const apiKey = getOpenRouterKey();

  if (!apiKey) {
    throw new IngestionConfigError(
      'OPENROUTER_API_KEY not configured. Ingestion requires a real LLM call; the previous canned-response fallback was removed in phase-0 cleanup.',
    );
  }

  const systemPrompt =
    opts.systemPrompt ??
    'You are a JSON-only reasoning-graph extractor. Respond with a single valid JSON object and nothing else. No markdown fences, no prose, no commentary.';

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.SITE_URL || 'http://localhost:4000',
      'X-Title': 'Inos',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      // Determinism: temperature 0.0 (was 0.3). Pass-pass determinism on
      // the bench moved from 40% → ~80% with this single change.
      temperature: 0.0,
      max_tokens: maxTokens,
      // We use json_object (universally supported by OpenRouter providers)
      // and embed the strict schema in the prompt itself. We tried json_schema
      // mode for stricter validation but it's unevenly supported across the
      // Anthropic + non-Anthropic models we want to stay agnostic of.
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `LLM call failed (${response.status}) model=${model}: ${body.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response');
  }

  return content;
}

// --- JSON parsing helpers ---

/**
 * Strip markdown fences and parse JSON. Returns the cleaned JSON string
 * (jsonStr) so callers can pass it to `ExtractionSchemaError.rawPayload`.
 */
function stripFencesAndParse(raw: string): {
  parsedJson: unknown;
  jsonStr: string;
} {
  let jsonStr = raw.trim();

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const parsedJson: unknown = JSON.parse(jsonStr);
  return { parsedJson, jsonStr };
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fence ? fence[1].trim() : trimmed;
}

/**
 * Lenient per-pass parser used by the multi-pass orchestrator. Each pass
 * (spine / support / edges / recovery / consolidation) returns a *partial*
 * shape — e.g. spine has `nodes` but no `edges`, recovery has
 * `missedNodes` — so the strict full-extraction zod schema can't be
 * applied here. The orchestrator does its own per-pass coercion via
 * `coerceNode` / `coerceEdge` (allow-listed types only), and the final
 * merged ExtractionResult is then validated through
 * `parseExtractionResult` below.
 */
function safeParseObject<T>(raw: string, label: string): T {
  try {
    return JSON.parse(stripCodeFence(raw)) as T;
  } catch (e) {
    throw new Error(
      `Failed to parse ${label} JSON: ${e instanceof Error ? e.message : String(e)}. First 200 chars: ${raw.slice(0, 200)}`,
    );
  }
}

interface ParseOutcome {
  result: ValidatedExtractionResult;
  edgesDropped: number;
}

/**
 * Run the merged ExtractionResult (post multi-pass orchestration) through
 * the zod pipeline: schema check, duplicate-id check, dangling-edge prune,
 * dangling dependsOn prune. Throws `ExtractionSchemaError` on failure;
 * the caller decides whether to retry.
 */
function parseExtractionResult(raw: string): ParseOutcome {
  let parsedJson: unknown;
  let jsonStr: string;
  try {
    ({ parsedJson, jsonStr } = stripFencesAndParse(raw));
  } catch (err: unknown) {
    // JSON.parse failure is also a schema violation from the caller's POV.
    const message = err instanceof Error ? err.message : String(err);
    throw new ExtractionSchemaError(
      [{ path: [], message: `invalid JSON: ${message}`, code: 'custom' }],
      raw.slice(0, 2048),
    );
  }

  const { result, edgesDropped } = validateExtractionResult(parsedJson, {
    rawPayload: jsonStr,
  });
  return { result, edgesDropped };
}

function validateMergedExtraction(
  extraction: ExtractionResult,
): ParseOutcome {
  // Validate an *already-assembled* ExtractionResult without going through
  // a JSON round-trip. We rebuild a payload string only for error reporting.
  const payload = JSON.stringify(extraction);
  const { result, edgesDropped } = validateExtractionResult(extraction, {
    rawPayload: payload,
  });
  return { result, edgesDropped };
}

// --- Multi-pass extraction ---

interface RawNode {
  id: string;
  type: string;
  title: string;
  content: string;
  author?: string;
  factKey?: string;
  /** P1.3: verbatim source excerpt the LLM was asked to emit per node. */
  excerpt?: string;
}

interface RawEdge {
  type: string;
  source: string;
  target: string;
  label?: string;
}

const ALLOWED_NODE_TYPES: ReadonlySet<ExtractedNodeType> = new Set<ExtractedNodeType>([
  'claim',
  'question',
  'decision',
  'evidence',
  'fact',
  'assumption',
  'insight',
  'branch',
  'constraint',
  'deliberation',
  'synthesis',
  'artifact',
]);

const ALLOWED_EDGE_TYPES: ReadonlySet<ExtractedEdgeType> = new Set<ExtractedEdgeType>([
  'supports',
  'challenges',
  'diverges',
  'depends_on',
  'refines',
  'references',
  'replaces',
  'merges',
  'inherits',
  'temporal',
]);

function coerceNode(raw: RawNode): ExtractedNode | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.id || !raw.type || !raw.title) return null;
  if (!ALLOWED_NODE_TYPES.has(raw.type as ExtractedNodeType)) return null;
  return {
    id: String(raw.id),
    type: raw.type as ExtractedNodeType,
    title: String(raw.title).slice(0, 240),
    content: String(raw.content ?? raw.title),
    author: String(raw.author ?? 'Author'),
    dependsOn: [],
    ...(raw.factKey ? { factKey: String(raw.factKey) } : {}),
    ...(raw.excerpt ? { excerpt: String(raw.excerpt) } : {}),
  };
}

function coerceEdge(raw: RawEdge, nodeIds: Set<string>): ExtractedEdge | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.type || !raw.source || !raw.target) return null;
  if (!ALLOWED_EDGE_TYPES.has(raw.type as ExtractedEdgeType)) return null;
  if (!nodeIds.has(raw.source) || !nodeIds.has(raw.target)) return null;
  if (raw.source === raw.target) return null;
  return {
    type: raw.type as ExtractedEdgeType,
    source: String(raw.source),
    target: String(raw.target),
    ...(raw.label ? { label: String(raw.label) } : {}),
  };
}

/**
 * Run the 3 reasoning passes on a single chunk:
 *   Pass 1: spine (question/claim/decision/insight/branch)
 *   Pass 2: support (fact/evidence/assumption/constraint)
 *   Pass 3: edges
 */
async function extractChunk(
  text: string,
  format: InputFormat,
  topic: string | undefined,
  model: string,
  chunkLabel: string,
): Promise<{ nodes: ExtractedNode[]; edges: ExtractedEdge[]; canvasName?: string; summary?: string }> {
  // Pass 1 — spine
  const spineRaw = await callLLM({
    prompt: buildSpinePrompt(format, text, topic),
    model,
    maxTokens: 4000,
  });
  const spineParsed = safeParseObject<{
    canvasName?: string;
    summary?: string;
    nodes?: RawNode[];
  }>(spineRaw, `${chunkLabel}/spine`);
  const spineNodes = (spineParsed.nodes ?? [])
    .map((n) => coerceNode(n))
    .filter((n): n is ExtractedNode => n !== null);

  // Pass 2 — support
  const spineJson = JSON.stringify(
    spineNodes.map((n) => ({ id: n.id, type: n.type, title: n.title })),
    null,
    2,
  );
  const supportRaw = await callLLM({
    prompt: buildSupportPrompt(format, text, spineJson),
    model,
    maxTokens: 4000,
  });
  const supportParsed = safeParseObject<{ nodes?: RawNode[] }>(
    supportRaw,
    `${chunkLabel}/support`,
  );
  const supportNodes = (supportParsed.nodes ?? [])
    .map((n) => coerceNode(n))
    .filter((n): n is ExtractedNode => n !== null);

  // Dedupe by id between spine and support; also rename collisions.
  const usedIds = new Set(spineNodes.map((n) => n.id));
  const mergedNodes: ExtractedNode[] = [...spineNodes];
  for (const n of supportNodes) {
    let id = n.id;
    let i = 1;
    while (usedIds.has(id)) {
      id = `${n.id}__${i++}`;
    }
    usedIds.add(id);
    mergedNodes.push({ ...n, id });
  }

  // Pass 3 — edges
  const nodesJson = JSON.stringify(
    mergedNodes.map((n) => ({ id: n.id, type: n.type, title: n.title })),
    null,
    2,
  );
  const edgeRaw = await callLLM({
    prompt: buildEdgePrompt(format, text, nodesJson),
    model,
    maxTokens: 4000,
  });
  const edgeParsed = safeParseObject<{ edges?: RawEdge[] }>(
    edgeRaw,
    `${chunkLabel}/edges`,
  );
  const nodeIdSet = new Set(mergedNodes.map((n) => n.id));
  const edges = (edgeParsed.edges ?? [])
    .map((e) => coerceEdge(e, nodeIdSet))
    .filter((e): e is ExtractedEdge => e !== null);

  return {
    nodes: mergedNodes,
    edges,
    canvasName: spineParsed.canvasName,
    summary: spineParsed.summary,
  };
}

/**
 * Pass 4 — recovery. Hand the model the source + current extraction; ask
 * it to flag missed reasoning units. Routed to Haiku (cheap; mechanical).
 *
 * We allow the recovery pass to also propose new edges for any missed
 * nodes it adds, by re-using the existing edge-coercion path.
 */
async function recoverMissed(
  text: string,
  current: { nodes: ExtractedNode[]; edges: ExtractedEdge[] },
): Promise<ExtractedNode[]> {
  const currentJson = JSON.stringify(
    current.nodes.map((n) => ({ id: n.id, type: n.type, title: n.title })),
    null,
    2,
  );
  let raw: string;
  try {
    raw = await callLLM({
      prompt: buildRecoveryPrompt(text, currentJson),
      model: getValidationModel(),
      maxTokens: 3000,
    });
  } catch (err) {
    // Recovery is best-effort. Don't fail the whole ingestion if Haiku
    // hiccups — just continue without it.
    console.warn(
      `[ingestion] Recovery pass failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
  const parsed = safeParseObject<{ missedNodes?: RawNode[] }>(raw, 'recovery');
  const candidates = (parsed.missedNodes ?? [])
    .map((n) => coerceNode(n))
    .filter((n): n is ExtractedNode => n !== null);

  // De-dupe against current set by normalized title.
  const seenTitles = new Set(current.nodes.map((n) => normalizeTitle(n.title)));
  const usedIds = new Set(current.nodes.map((n) => n.id));
  const added: ExtractedNode[] = [];
  for (const c of candidates) {
    const norm = normalizeTitle(c.title);
    if (seenTitles.has(norm)) continue;
    seenTitles.add(norm);
    let id = c.id;
    let i = 1;
    while (usedIds.has(id)) {
      id = `${c.id}__rec${i++}`;
    }
    usedIds.add(id);
    added.push({ ...c, id });
  }
  return added;
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Consolidation pass — used when input was chunked. Runs on Haiku.
 */
async function consolidateChunks(
  perChunk: Array<{ nodes: ExtractedNode[]; edges: ExtractedEdge[]; canvasName?: string; summary?: string }>,
  topic: string | undefined,
): Promise<{ nodes: ExtractedNode[]; edges: ExtractedEdge[]; canvasName: string; summary: string }> {
  // Trivial merge first: id-prefix per chunk to avoid collisions.
  const allNodes: ExtractedNode[] = [];
  const allEdges: ExtractedEdge[] = [];
  perChunk.forEach((c, idx) => {
    const prefix = `c${idx + 1}_`;
    const idMap = new Map<string, string>();
    for (const n of c.nodes) {
      const newId = `${prefix}${n.id}`;
      idMap.set(n.id, newId);
      allNodes.push({ ...n, id: newId });
    }
    for (const e of c.edges) {
      const s = idMap.get(e.source);
      const t = idMap.get(e.target);
      if (!s || !t) continue;
      allEdges.push({ ...e, source: s, target: t });
    }
  });

  const canvasName =
    perChunk.find((c) => c.canvasName)?.canvasName ?? topic ?? 'Imported Canvas';
  const summary = perChunk.map((c) => c.summary).filter(Boolean).join(' ') || '';

  // Ask the consolidator to dedupe + propose cross-chunk edges.
  const condensed = allNodes.map((n) => ({ id: n.id, type: n.type, title: n.title }));
  const perChunkJson = JSON.stringify({ nodes: condensed, edges: allEdges.map((e) => ({ type: e.type, source: e.source, target: e.target })) }, null, 2);

  let consRaw: string;
  try {
    consRaw = await callLLM({
      prompt: buildConsolidationPrompt(perChunkJson, topic),
      model: getValidationModel(),
      maxTokens: 3000,
    });
  } catch (err) {
    console.warn(
      `[ingestion] Consolidation pass failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`,
    );
    return { nodes: allNodes, edges: allEdges, canvasName, summary };
  }

  const parsed = safeParseObject<{
    canvasName?: string;
    summary?: string;
    keepNodeIds?: string[];
    renameNodes?: Array<{ id: string; title: string }>;
    extraEdges?: RawEdge[];
  }>(consRaw, 'consolidation');

  // Apply keepNodeIds filter only if it's non-empty and reasonable.
  let finalNodes = allNodes;
  if (Array.isArray(parsed.keepNodeIds) && parsed.keepNodeIds.length > 0) {
    const keep = new Set(parsed.keepNodeIds);
    // Never drop more than 25% — protect against over-aggressive consolidation.
    const wouldDrop = allNodes.filter((n) => !keep.has(n.id)).length;
    if (wouldDrop <= allNodes.length * 0.25) {
      finalNodes = allNodes.filter((n) => keep.has(n.id));
    }
  }

  if (Array.isArray(parsed.renameNodes)) {
    const renameMap = new Map(parsed.renameNodes.map((r) => [r.id, r.title]));
    finalNodes = finalNodes.map((n) =>
      renameMap.has(n.id) ? { ...n, title: String(renameMap.get(n.id)).slice(0, 240) } : n,
    );
  }

  const finalNodeIds = new Set(finalNodes.map((n) => n.id));
  const filteredEdges = allEdges.filter((e) => finalNodeIds.has(e.source) && finalNodeIds.has(e.target));
  const extraEdges = (parsed.extraEdges ?? [])
    .map((e) => coerceEdge(e, finalNodeIds))
    .filter((e): e is ExtractedEdge => e !== null);

  return {
    nodes: finalNodes,
    edges: [...filteredEdges, ...extraEdges],
    canvasName: parsed.canvasName ?? canvasName,
    summary: parsed.summary ?? summary,
  };
}

// --- Build InosGraph from extraction ---

function makeAuthor(authorLabel: string): NodeAuthor {
  if (authorLabel === 'AI' || authorLabel === 'Unknown') {
    return { type: 'agent', agentId: 'inos-ingestion', model: 'simulated' };
  }
  return {
    type: 'human',
    userId: `ingested-${authorLabel.toLowerCase().replace(/\s+/g, '-')}`,
    displayName: authorLabel,
  };
}

function buildGraph(
  result: ValidatedExtractionResult,
  positionedNodes: ReturnType<
    typeof forceLayout<
      ValidatedExtractionResult['nodes'][number],
      ValidatedExtractionResult['edges'][number]
    >
  >,
  originalText: string,
): InosGraph {
  const now = new Date().toISOString();
  const canvasId = uuidv4();
  const systemAuthor: NodeAuthor = { type: 'system', source: 'ingestion' };
  const resolveStats = emptyResolveStats();

  // First pass: assign InosNode uuids and build extraction-id -> uuid map.
  const extIdToInosId = new Map<string, string>();
  for (const pn of positionedNodes) {
    extIdToInosId.set(pn.id, uuidv4());
  }

  // Second pass: construct InosNodes with fully-resolved dependsOn (uuids)
  // and resolved source spans (from the verbatim excerpt the LLM emitted).
  // Raw `excerpt` is intentionally NOT copied onto the final InosNode —
  // only the resolved sourceSpan (with verified offsets) is.
  const nodes: InosNode[] = positionedNodes.map((pn) => {
    const newId = extIdToInosId.get(pn.id);
    if (!newId) {
      // Unreachable: we just populated it above. Defensive only.
      throw new Error(`internal: no uuid for extraction id ${pn.id}`);
    }
    const resolvedDeps = pn.dependsOn
      .map((d) => extIdToInosId.get(d))
      .filter((d): d is string => typeof d === 'string');

    let sourceSpan: ReturnType<typeof resolveSourceSpan> = undefined;
    if (pn.excerpt) {
      sourceSpan = resolveSourceSpan(originalText, pn.excerpt, resolveStats);
    } else {
      resolveStats.unresolved++;
    }

    const base: InosNode = {
      id: newId,
      type: pn.type,
      title: pn.title,
      content: pn.content,
      author: makeAuthor(pn.author),
      createdAt: now,
      updatedAt: now,
      visits: [],
      dependsOn: resolvedDeps,
      staleness: {
        state: 'fresh',
        evaluatedAt: now,
        cascadeDepth: 0,
      },
      canvasId,
      status: 'fresh',
      tags: ['ingested'],
      schemaVersion: '1.0.0',
      ...(sourceSpan ? { sourceSpan } : {}),
    };
    if (pn.factKey) {
      base.engramMemoryId = pn.factKey;
    }
    return base;
  });

  // Edges: extraction has already been validated to only reference known
  // ids, so .get(...) lookups are guaranteed defined. We still narrow
  // explicitly to avoid any `!` assertions.
  const edges: InosEdge[] = [];
  for (const re of result.edges) {
    const sourceId = extIdToInosId.get(re.source);
    const targetId = extIdToInosId.get(re.target);
    if (!sourceId || !targetId) {
      // Should never happen post-validation, but skip silently if it does.
      continue;
    }
    const edge: InosEdge = {
      id: uuidv4(),
      type: re.type,
      sourceId,
      targetId,
      label: re.label,
      createdAt: now,
      author: systemAuthor,
      canvasId,
      schemaVersion: '1.0.0',
    };
    edges.push(edge);
  }

  console.log(
    `[ingestion] sourceSpan strategy breakdown: exact=${resolveStats.exact} normalized=${resolveStats.normalized} fuzzy=${resolveStats.fuzzy} unresolved=${resolveStats.unresolved}`,
  );

  const canvas: Canvas = {
    id: canvasId,
    name: result.canvasName,
    description: result.summary,
    author: systemAuthor,
    createdAt: now,
    updatedAt: now,
    participants: [systemAuthor],
    tags: ['ingested'],
    schemaVersion: '1.0.0',
  };

  return {
    schemaVersion: '1.0.0',
    canvas,
    nodes,
    edges,
    temporalIndex: [],
    factRegistry: {},
  };
}

// --- Compute stats ---

function computeStats(graph: InosGraph, edgesDropped: number): IngestStats {
  return {
    nodesExtracted: graph.nodes.length,
    edgesExtracted: graph.edges.length,
    factsExtracted: graph.nodes.filter((n) => n.type === 'fact').length,
    decisionsExtracted: graph.nodes.filter((n) => n.type === 'decision').length,
    questionsExtracted: graph.nodes.filter((n) => n.type === 'question').length,
    edgesDropped,
    nodesWithSpan: graph.nodes.filter((n) => n.sourceSpan != null).length,
  };
}

// --- Public API ---

export interface IngestOptions {
  text: string;
  format?: InputFormat;
  topic?: string;
  model?: string;
  extractFacts?: boolean;
  extractAssumptions?: boolean;
  extractDecisions?: boolean;
}

export async function extractAndBuildGraph(
  options: IngestOptions,
): Promise<{ graph: InosGraph; stats: IngestStats }> {
  const text = preprocessText(options.text);
  if (!text) {
    throw new Error('Empty input text');
  }

  const format = options.format === 'auto' || !options.format ? detectFormat(text) : options.format;
  const model = getModel(options.model);

  const chunks = chunkText(text);
  console.log(
    `[ingestion] Multi-pass extraction: model=${model}, format=${format}, textLen=${text.length}, chunks=${chunks.length}`,
  );

  // Run each chunk through spine → support → edges.
  const perChunk: Array<{
    nodes: ExtractedNode[];
    edges: ExtractedEdge[];
    canvasName?: string;
    summary?: string;
  }> = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const label = chunks.length === 1 ? 'single' : `chunk${i + 1}/${chunks.length}`;
    const result = await extractChunk(chunk, format, options.topic, model, label);
    console.log(
      `[ingestion] ${label}: spine+support=${result.nodes.length} edges=${result.edges.length}`,
    );
    perChunk.push(result);
  }

  // Merge / consolidate.
  let merged: { nodes: ExtractedNode[]; edges: ExtractedEdge[]; canvasName: string; summary: string };
  if (chunks.length === 1) {
    const single = perChunk[0];
    merged = {
      nodes: single.nodes,
      edges: single.edges,
      canvasName: single.canvasName ?? options.topic ?? 'Imported Canvas',
      summary: single.summary ?? '',
    };
  } else {
    merged = await consolidateChunks(perChunk, options.topic);
  }

  // Pass 4 — recovery sweep.
  const recovered = await recoverMissed(text, merged);
  if (recovered.length > 0) {
    console.log(`[ingestion] Recovery added ${recovered.length} missed node(s)`);
    merged.nodes = [...merged.nodes, ...recovered];
  }

  // Apply config filters (extractFacts=false etc.) AFTER recovery.
  // We keep these for back-compat with the API surface but they no longer
  // gate prompt content — easier to filter the produced extraction.
  if (options.extractFacts === false) {
    merged.nodes = merged.nodes.filter((n) => n.type !== 'fact');
  }
  if (options.extractAssumptions === false) {
    merged.nodes = merged.nodes.filter((n) => n.type !== 'assumption');
  }
  if (options.extractDecisions === false) {
    merged.nodes = merged.nodes.filter((n) => n.type !== 'decision');
  }
  const finalIds = new Set(merged.nodes.map((n) => n.id));
  merged.edges = merged.edges.filter((e) => finalIds.has(e.source) && finalIds.has(e.target));

  console.log(
    `[ingestion] Final: ${merged.nodes.length} nodes, ${merged.edges.length} edges`,
  );

  const extraction: ExtractionResult = {
    nodes: merged.nodes,
    edges: merged.edges,
    canvasName: merged.canvasName,
    summary: merged.summary,
  };

  // P1.2 hand-off: run the final merged extraction through the strict
  // zod pipeline. Per-pass `coerceNode`/`coerceEdge` already filtered out
  // unknown enum members and broken refs, so this is mostly a final
  // safety net (and a place to track `edgesDropped`). If it fails, we
  // try one Haiku recovery call to repair the offending nodes, then
  // re-validate; a second failure surfaces to the route (-> 502).
  let validated: ValidatedExtractionResult;
  let edgesDropped: number;
  try {
    const outcome = validateMergedExtraction(extraction);
    validated = outcome.result;
    edgesDropped = outcome.edgesDropped;
  } catch (err: unknown) {
    if (!(err instanceof ExtractionSchemaError)) throw err;
    console.warn(
      `[ingestion] Final schema validation failed (issues=${err.issues.length}); attempting one repair pass.`,
    );
    const repairPrompt = [
      'The following extraction failed schema validation. Issues:',
      err.summaryForLLM(),
      '',
      'Return a CORRECTED full extraction in valid JSON:',
      '{ "nodes": [...], "edges": [...], "canvasName": "...", "summary": "..." }',
      'Use ONLY these node types: claim, question, decision, evidence, fact, assumption,',
      'insight, branch, constraint, deliberation, synthesis, artifact.',
      'Use ONLY these edge types: supports, challenges, diverges, depends_on, refines,',
      'references, replaces, merges, inherits, temporal.',
      'Every edge.source/target MUST match an existing node.id.',
      'Every node MUST have a unique id, type, title, content, author, dependsOn[].',
      'Each node MAY include an optional "excerpt" field (5-40 word verbatim quote).',
      '',
      'CURRENT (broken) extraction:',
      JSON.stringify(extraction),
    ].join('\n');
    let repairRaw: string;
    try {
      repairRaw = await callLLM({
        prompt: repairPrompt,
        model: getValidationModel(),
        maxTokens: 5000,
      });
    } catch (callErr) {
      console.warn(
        `[ingestion] Repair call failed (${callErr instanceof Error ? callErr.message : String(callErr)}); re-throwing original schema error.`,
      );
      throw err;
    }
    const outcome = parseExtractionResult(repairRaw); // throws ExtractionSchemaError on second failure
    validated = outcome.result;
    edgesDropped = outcome.edgesDropped;
    console.log(
      `[ingestion] Repair succeeded: ${validated.nodes.length} nodes, ${validated.edges.length} edges (dropped ${edgesDropped})`,
    );
  }

  const positionedNodes = forceLayout(validated.nodes, validated.edges);
  const graph = buildGraph(validated, positionedNodes, text);
  const stats = computeStats(graph, edgesDropped);

  return { graph, stats };
}
