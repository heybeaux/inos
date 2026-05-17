/**
 * Core LLM extraction logic for transcript ingestion.
 *
 * Pipeline:
 *   1. Pre-process raw text (clean formatting, identify speakers)
 *   2. Build LLM prompt with extraction instructions
 *   3. Call the LLM (OpenRouter-compatible interface)
 *   4. Parse structured JSON response
 *   5. Construct InosGraph from extraction results
 *   6. Apply force-directed layout for initial node positions
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  InosGraph,
  InosNode,
  InosEdge,
  NodeAuthor,
  Canvas,
} from '@heybeaux/inos-types';
import { buildExtractionPrompt } from './prompts.js';
import { forceLayout } from './layout.js';
import {
  ExtractionSchemaError,
  validateExtractionResult,
  type ValidatedExtractionResult,
} from './schema.js';
import type {
  InputFormat,
  IngestStats,
} from './types.js';

export { ExtractionSchemaError } from './schema.js';

// --- Configuration ---

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';

function getOpenRouterKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

function getModel(configModel?: string): string {
  return configModel || process.env.INGESTION_MODEL || DEFAULT_MODEL;
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

// --- LLM call ---

export class IngestionConfigError extends Error {
  readonly code = 'OPENROUTER_UNCONFIGURED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'IngestionConfigError';
  }
}

const BASE_SYSTEM_PROMPT =
  'You are a JSON-only reasoning-graph extractor. Output ONLY valid JSON. No markdown, no explanation.';

async function callLLM(
  prompt: string,
  model: string,
  extraSystem?: string,
): Promise<string> {
  const apiKey = getOpenRouterKey();

  if (!apiKey) {
    throw new IngestionConfigError(
      'OPENROUTER_API_KEY not configured. Ingestion requires a real LLM call; the previous canned-response fallback was removed in phase-0 cleanup.',
    );
  }

  const systemContent = extraSystem
    ? `${BASE_SYSTEM_PROMPT}\n\n${extraSystem}`
    : BASE_SYSTEM_PROMPT;

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
        { role: 'system', content: systemContent },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `LLM call failed (${response.status}): ${body.slice(0, 300)}`
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

// --- Parse LLM response ---

/**
 * Strip markdown fences and parse JSON. Returns the raw (jsonStr) for
 * inclusion in `ExtractionSchemaError.rawPayload` on validation failure.
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

interface ParseOutcome {
  result: ValidatedExtractionResult;
  edgesDropped: number;
}

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
    typeof forceLayout<ValidatedExtractionResult['nodes'][number], ValidatedExtractionResult['edges'][number]>
  >,
): InosGraph {
  const now = new Date().toISOString();
  const canvasId = uuidv4();
  const systemAuthor: NodeAuthor = { type: 'system', source: 'ingestion' };

  // First pass: assign InosNode uuids and build extraction-id -> uuid map.
  const extIdToInosId = new Map<string, string>();
  for (const pn of positionedNodes) {
    extIdToInosId.set(pn.id, uuidv4());
  }

  // Second pass: construct InosNodes with fully-resolved dependsOn (uuids).
  const nodes: InosNode[] = positionedNodes.map((pn) => {
    const newId = extIdToInosId.get(pn.id);
    if (!newId) {
      // Unreachable: we just populated it above. Defensive only.
      throw new Error(`internal: no uuid for extraction id ${pn.id}`);
    }
    const resolvedDeps = pn.dependsOn
      .map((d) => extIdToInosId.get(d))
      .filter((d): d is string => typeof d === 'string');

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

function buildRetrySystemMessage(err: ExtractionSchemaError): string {
  return [
    'Your previous response failed schema validation. Issues:',
    err.summaryForLLM(),
    '',
    'Return the SAME extraction in valid JSON matching the schema.',
    'Use ONLY these node types: claim, question, decision, evidence, fact, assumption.',
    'Use ONLY these edge types: supports, challenges, diverges, depends_on, refines, references.',
    'Every edge.source and edge.target MUST match an existing node.id.',
    'Every node MUST have a unique id, a non-empty title, and a dependsOn array (empty if none).',
  ].join('\n');
}

export async function extractAndBuildGraph(
  options: IngestOptions
): Promise<{ graph: InosGraph; stats: IngestStats }> {
  const text = preprocessText(options.text);
  if (!text) {
    throw new Error('Empty input text');
  }

  const format = options.format === 'auto' || !options.format
    ? detectFormat(text)
    : options.format;

  const model = getModel(options.model);

  const prompt = buildExtractionPrompt(format, text, options.topic, {
    extractFacts: options.extractFacts,
    extractAssumptions: options.extractAssumptions,
    extractDecisions: options.extractDecisions,
  });

  console.log(
    `[ingestion] Calling LLM: model=${model}, format=${format}, textLen=${text.length}`
  );

  // First attempt.
  let parseOutcome: ParseOutcome;
  try {
    const rawResponse = await callLLM(prompt, model);
    parseOutcome = parseExtractionResult(rawResponse);
  } catch (err: unknown) {
    if (err instanceof ExtractionSchemaError) {
      console.warn(
        `[ingestion] Schema validation failed on first pass; retrying once. issues=${err.issues.length}`,
      );
      // One-shot retry with error summary embedded in the system prompt.
      const retryRaw = await callLLM(prompt, model, buildRetrySystemMessage(err));
      // If this throws ExtractionSchemaError again, surface to caller (-> 502 in route).
      parseOutcome = parseExtractionResult(retryRaw);
    } else {
      throw err;
    }
  }

  const { result: extraction, edgesDropped } = parseOutcome;

  console.log(
    `[ingestion] Extracted ${extraction.nodes.length} nodes, ${extraction.edges.length} edges (dropped ${edgesDropped})`
  );

  const positionedNodes = forceLayout(extraction.nodes, extraction.edges);
  const graph = buildGraph(extraction, positionedNodes);
  const stats = computeStats(graph, edgesDropped);

  return { graph, stats };
}
