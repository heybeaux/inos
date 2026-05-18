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
import {
  spineJsonSchema,
  supportJsonSchema,
  edgesJsonSchema,
  recoveryJsonSchema,
  consolidationJsonSchema,
  repairJsonSchema,
} from './jsonSchemas.js';
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
  /**
   * Max output tokens. Default raised from 4k → 8k after fixtures 01/05
   * truncated mid-JSON on the wedge-quality bench (Parliament a24184eb).
   * Sonnet 4.6 handles 8k comfortably; long extractions sometimes need it.
   */
  maxTokens?: number;
  /** System prompt override. Default is the JSON-only contract. */
  systemPrompt?: string;
  /**
   * OpenRouter `response_format: json_schema` payload. Providers that honor
   * it (OpenAI, Gemini, some others) hard-constrain generation; Anthropic
   * via OpenRouter silently degrades to `json_object`. Either way, the
   * downstream parse-retry catches what slips through.
   */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /**
   * Label for logs and error messages (e.g. "single/spine"). Threaded
   * through so the parse-retry can mark the second attempt.
   */
  label?: string;
}

interface LLMCallResult {
  content: string;
  /** True if we hit the JSON.parse-recovery path. */
  retried: boolean;
  finishReason?: string;
}

// --- Retry / backoff / timeout ---
//
// Issue #13: previously spine / support / edges threw on any non-2xx, so a
// transient 429 or 502 from OpenRouter killed the whole ingestion. We retry
// transient failures (429 + 5xx + AbortError + network) with exponential
// backoff and jitter, and give each call a 90s timeout. Existing
// recovery+consolidation try/catch fallbacks still apply on top.
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1000;
const RETRY_FACTOR = 2;
const RETRY_JITTER = 0.2; // ±20%
const CALL_TIMEOUT_MS = 90_000;

/**
 * `fetch` is only retried when failure is transient. 4xx other than 429
 * are permanent (bad request / auth / invalid model) — retrying would just
 * burn quota.
 */
function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function jitteredDelay(attempt: number): number {
  const base = RETRY_BASE_MS * Math.pow(RETRY_FACTOR, attempt);
  const jitter = base * RETRY_JITTER * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(base + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exported for unit testing — overrideable via `__setFetchForTests`.
 * Defaults to global fetch.
 */
let fetchImpl: typeof fetch = (input, init) => fetch(input, init);

/** @internal — tests only */
export function __setFetchForTests(impl: typeof fetch | null): void {
  fetchImpl = impl ?? ((input, init) => fetch(input, init));
}

async function rawOpenRouterCall(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens: number;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  label?: string;
}): Promise<{ content: string; finishReason?: string }> {
  const responseFormat = opts.jsonSchema
    ? {
        type: 'json_schema' as const,
        json_schema: {
          name: opts.jsonSchema.name,
          strict: true,
          schema: opts.jsonSchema.schema,
        },
      }
    : { type: 'json_object' as const };

  const body = JSON.stringify({
    model: opts.model,
    messages: [
      { role: 'system', content: opts.systemPrompt },
      ...opts.userMessages,
    ],
    temperature: 0.0,
    max_tokens: opts.maxTokens,
    response_format: responseFormat,
  });

  let lastErr: Error | undefined;
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
    try {
      const response = await fetchImpl(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
          'HTTP-Referer': process.env.SITE_URL || 'http://localhost:4000',
          'X-Title': 'Inos',
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const retryable = isRetryableHttpStatus(response.status);
        const err = new Error(
          `LLM call failed (${response.status}) model=${opts.model} label=${opts.label ?? 'n/a'}: ${text.slice(0, 300)}`,
        );
        if (retryable && attempt < RETRY_MAX_ATTEMPTS - 1) {
          const delay = jitteredDelay(attempt);
          console.warn(
            `[ingestion] LLM ${opts.label ?? ''} attempt ${attempt + 1}/${RETRY_MAX_ATTEMPTS} got ${response.status}; retrying in ${delay}ms`,
          );
          lastErr = err;
          await sleep(delay);
          continue;
        }
        throw err;
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string };
          finish_reason?: string;
        }>;
      };
      const choice = data.choices?.[0];
      const content = choice?.message?.content;
      if (!content) {
        throw new Error('LLM returned empty response');
      }
      return { content, finishReason: choice?.finish_reason };
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || /aborted|timed? ?out/i.test(err.message));
      const isNetwork =
        err instanceof TypeError ||
        (err instanceof Error &&
          /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|socket hang up/i.test(
            err.message,
          ));
      const retryable = isAbort || isNetwork;
      const e = err instanceof Error ? err : new Error(String(err));
      if (retryable && attempt < RETRY_MAX_ATTEMPTS - 1) {
        const delay = jitteredDelay(attempt);
        console.warn(
          `[ingestion] LLM ${opts.label ?? ''} attempt ${attempt + 1}/${RETRY_MAX_ATTEMPTS} ${isAbort ? 'timed out' : 'network err'}; retrying in ${delay}ms (${e.message})`,
        );
        lastErr = e;
        await sleep(delay);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  // Unreachable: the loop either returns or throws on the final attempt.
  throw lastErr ?? new Error('LLM call exhausted retries with no error');
}

function tryParseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(stripCodeFence(raw)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Call OpenRouter with structured-output + JSON.parse-recovery.
 *
 * Layered defense (per Parliament a24184eb synthesis):
 *   1. `response_format: json_schema` constrains generation where supported.
 *   2. If the response still fails JSON.parse (Anthropic-degrade case, or
 *      finish_reason=length), retry ONCE with an assistant turn echoing
 *      the broken output + a user turn asking for a complete-and-valid
 *      JSON object. Bumps `max_tokens` 50% to give the model headroom.
 *   3. If the retry also fails, the error propagates to `safeParseObject`
 *      and the caller decides (most callers re-throw to the route).
 */
async function callLLM(opts: LLMCallOpts): Promise<string> {
  const { prompt, model, jsonSchema, label } = opts;
  const maxTokens = opts.maxTokens ?? 8000;
  const apiKey = getOpenRouterKey();
  if (!apiKey) {
    throw new IngestionConfigError(
      'OPENROUTER_API_KEY not configured. Ingestion requires a real LLM call; the previous canned-response fallback was removed in phase-0 cleanup.',
    );
  }
  const systemPrompt =
    opts.systemPrompt ??
    'You are a JSON-only reasoning-graph extractor. Respond with a single valid JSON object and nothing else. No markdown fences, no prose, no commentary.';

  const first = await rawOpenRouterCall({
    apiKey,
    model,
    systemPrompt,
    userMessages: [{ role: 'user', content: prompt }],
    maxTokens,
    jsonSchema,
    label,
  });

  const parsed = tryParseJson(first.content);
  if (parsed.ok && first.finishReason !== 'length') {
    return first.content;
  }

  // Layer 2: parse failed (or generation was truncated). Retry once.
  const reason =
    first.finishReason === 'length'
      ? 'Your previous output was truncated at the max_tokens limit before the JSON closed.'
      : `Your previous output failed to parse as JSON: ${parsed.ok ? 'unknown' : parsed.error}`;
  console.warn(
    `[ingestion] callLLM(${label ?? 'unknown'}) parse-retry firing: finish=${first.finishReason ?? 'n/a'} parseOk=${parsed.ok}`,
  );
  const retried = await rawOpenRouterCall({
    apiKey,
    model,
    systemPrompt,
    userMessages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: first.content },
      {
        role: 'user',
        content: `${reason} Respond again with a SINGLE complete, valid JSON object that satisfies the original instructions. Be more concise if needed to fit within token limits. Output ONLY the JSON object — no markdown, no prose.`,
      },
    ],
    // Give the retry 50% more headroom for the same output budget.
    maxTokens: Math.min(Math.ceil(maxTokens * 1.5), 16000),
    jsonSchema,
    label: label ? `${label}/retry` : undefined,
  });

  // We surface the retried content even if it still doesn't parse —
  // safeParseObject will throw a labeled error that the caller wraps.
  return retried.content;
}

// --- JSON parsing helpers ---

/**
 * Strip exactly one OUTER markdown code-fence pair if present and parse JSON.
 *
 * Issue #14 — the prior regex `/```(?:json)?\s*([\s\S]*?)```/` was
 * non-greedy and matched the FIRST occurrence of "```" anywhere in the
 * string, even when it appeared inside a JSON string value (e.g. a node
 * `content` quoting a code block). Non-greedy `.*?` then ended at the
 * FIRST closing "```", silently truncating the JSON. The strict variant
 * below only strips when the trimmed payload genuinely starts AND ends
 * with a fence; otherwise it leaves the raw text alone and lets
 * JSON.parse decide.
 */
function stripFencesAndParse(raw: string): {
  parsedJson: unknown;
  jsonStr: string;
} {
  const jsonStr = stripCodeFence(raw);
  const parsedJson: unknown = JSON.parse(jsonStr);
  return { parsedJson, jsonStr };
}

/** @internal — exported for unit testing */
export function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();

  // Only strip if the WHOLE payload is wrapped in a single fence pair.
  // Anything else (including a leading "```" with no matching trailing one,
  // or fences embedded inside a JSON string value) is left alone — better
  // to fail JSON.parse loudly than silently truncate.
  if (!trimmed.startsWith('```')) return trimmed;

  // Strip the opening fence line (e.g. "```" or "```json"). The fence line
  // ends at the first newline; everything past it is the payload candidate.
  const firstNewline = trimmed.indexOf('\n');
  // A "```" with no newline before EOF is malformed — fall back to raw so
  // JSON.parse surfaces the real problem.
  if (firstNewline === -1) return trimmed;

  const openerLine = trimmed.slice(0, firstNewline).trim();
  // Opener must be just "```" or "```<lang>" with no other content.
  if (!/^```[A-Za-z0-9_-]*$/.test(openerLine)) return trimmed;

  const afterOpener = trimmed.slice(firstNewline + 1);

  // Closing fence: trailing "```" (with optional surrounding whitespace).
  if (!afterOpener.trimEnd().endsWith('```')) return trimmed;

  const closingIdx = afterOpener.lastIndexOf('```');
  return afterOpener.slice(0, closingIdx).trim();
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
    maxTokens: 8000,
    jsonSchema: { name: 'inos_spine', schema: spineJsonSchema },
    label: `${chunkLabel}/spine`,
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
    maxTokens: 8000,
    jsonSchema: { name: 'inos_support', schema: supportJsonSchema },
    label: `${chunkLabel}/support`,
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
    maxTokens: 8000,
    jsonSchema: { name: 'inos_edges', schema: edgesJsonSchema },
    label: `${chunkLabel}/edges`,
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
  warnings?: string[],
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
      maxTokens: 6000,
      jsonSchema: { name: 'inos_recovery', schema: recoveryJsonSchema },
      label: 'recovery',
    });
  } catch (err) {
    // Recovery is best-effort. Don't fail the whole ingestion if Haiku
    // hiccups — just continue without it.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ingestion] Recovery pass failed (non-fatal): ${msg}`);
    if (warnings) {
      warnings.push(
        `recovery pass failed after retries; missed-node sweep skipped: ${msg.slice(0, 200)}`,
      );
    }
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
 * Supplemental edge pass — wires up nodes that the original Pass-3 edge call
 * did not see (typically nodes added by the Pass-4 recovery sweep). Returns
 * ONLY genuinely new edges (deduped against `existingEdges`). Routed to the
 * cheap validation model since the structural reasoning was already done by
 * the main edge pass.
 *
 * Symmetric with `coerceEdge`: dedupes by (type, source, target).
 */
async function edgesForFullNodeSet(
  text: string,
  format: InputFormat,
  allNodes: ExtractedNode[],
  existingEdges: ExtractedEdge[],
  model: string,
): Promise<ExtractedEdge[]> {
  if (allNodes.length === 0) return [];
  const nodeIdSet = new Set(allNodes.map((n) => n.id));
  const nodesJson = JSON.stringify(
    allNodes.map((n) => ({ id: n.id, type: n.type, title: n.title })),
    null,
    2,
  );
  const raw = await callLLM({
    prompt: buildEdgePrompt(format, text, nodesJson),
    model,
    maxTokens: 6000,
    jsonSchema: { name: 'inos_edges_recovery', schema: edgesJsonSchema },
    label: 'edges-post-recovery',
  });
  const parsed = safeParseObject<{ edges?: RawEdge[] }>(raw, 'edges-post-recovery');
  const proposed = (parsed.edges ?? [])
    .map((e) => coerceEdge(e, nodeIdSet))
    .filter((e): e is ExtractedEdge => e !== null);

  // Dedupe against existing edges by (type, source, target).
  const seen = new Set(
    existingEdges.map((e) => `${e.type}|${e.source}|${e.target}`),
  );
  const fresh: ExtractedEdge[] = [];
  for (const e of proposed) {
    const key = `${e.type}|${e.source}|${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(e);
  }
  return fresh;
}

/**
 * Consolidation pass — used when input was chunked. Runs on Haiku.
 *
 * Surfaces non-fatal warnings via the `warnings` out-param. If the LLM
 * call fails after retries, we return the trivially-merged graph (no
 * dedupe / cross-chunk edges) and push a warning instead of throwing —
 * earlier passes succeeded and a partial graph beats losing everything.
 */
async function consolidateChunks(
  perChunk: Array<{ nodes: ExtractedNode[]; edges: ExtractedEdge[]; canvasName?: string; summary?: string }>,
  topic: string | undefined,
  warnings?: string[],
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
      maxTokens: 6000,
      jsonSchema: { name: 'inos_consolidation', schema: consolidationJsonSchema },
      label: 'consolidation',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ingestion] Consolidation pass failed (non-fatal): ${msg}`);
    if (warnings) {
      warnings.push(
        `consolidation pass failed after retries; returning per-chunk merge without dedupe/cross-chunk edges: ${msg.slice(0, 200)}`,
      );
    }
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

function computeStats(
  graph: InosGraph,
  edgesDropped: number,
  parseWarnings?: string[],
): IngestStats {
  return {
    nodesExtracted: graph.nodes.length,
    edgesExtracted: graph.edges.length,
    factsExtracted: graph.nodes.filter((n) => n.type === 'fact').length,
    decisionsExtracted: graph.nodes.filter((n) => n.type === 'decision').length,
    questionsExtracted: graph.nodes.filter((n) => n.type === 'question').length,
    edgesDropped,
    nodesWithSpan: graph.nodes.filter((n) => n.sourceSpan != null).length,
    ...(parseWarnings && parseWarnings.length > 0
      ? { parseWarnings }
      : {}),
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
  // Accumulator for non-fatal warnings (#13). Surfaces to IngestStats so the
  // caller can decide whether to flag a partial result in the UI.
  const parseWarnings: string[] = [];
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
    merged = await consolidateChunks(perChunk, options.topic, parseWarnings);
  }

  // Pass 4 — recovery sweep.
  const recovered = await recoverMissed(text, merged, parseWarnings);
  if (recovered.length > 0) {
    console.log(`[ingestion] Recovery added ${recovered.length} missed node(s)`);
    merged.nodes = [...merged.nodes, ...recovered];

    // edgeRecall fix (#4): the original Pass-3 edge call ran BEFORE recovery,
    // so any recovered node had zero incoming/outgoing edges. Catastrophic on
    // fixtures where Pass 4 surfaces 2–3 load-bearing nodes (fixtures 04/05
    // dropped to edgeRecall 0.22/0.18 from this alone). Re-run Pass 3 against
    // the FULL merged node set so recovered nodes can be wired up. Edges are
    // permitted to reference any node from any prior pass.
    try {
      const newEdges = await edgesForFullNodeSet(
        text,
        format,
        merged.nodes,
        merged.edges,
        getValidationModel(),
      );
      if (newEdges.length > 0) {
        console.log(
          `[ingestion] Post-recovery edge pass added ${newEdges.length} edge(s)`,
        );
        merged.edges = [...merged.edges, ...newEdges];
      }
    } catch (err) {
      // Best-effort: don't fail the whole ingestion if the supplemental
      // edge call hiccups. The existing edges from Pass 3 are still good.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[ingestion] Post-recovery edge pass failed (non-fatal): ${msg}`,
      );
      parseWarnings.push(
        `post-recovery edge pass failed after retries; recovered nodes may have fewer edges: ${msg.slice(0, 200)}`,
      );
    }
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
        maxTokens: 8000,
        jsonSchema: { name: 'inos_repair', schema: repairJsonSchema },
        label: 'repair',
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
  const stats = computeStats(graph, edgesDropped, parseWarnings);

  return { graph, stats };
}
