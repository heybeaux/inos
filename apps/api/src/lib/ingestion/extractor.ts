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
import type {
  InputFormat,
  ExtractionResult,
  ExtractedNode,
  IngestStats,
} from './types.js';

// --- Configuration ---

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

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

async function callLLM(
  prompt: string,
  model: string
): Promise<string> {
  const apiKey = getOpenRouterKey();

  if (!apiKey) {
    // No API key — return simulated response for end-to-end testing
    console.log('[ingestion] No OpenRouter API key; using simulated response');
    return simulateLLMResponse(prompt);
  }

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
        {
          role: 'system',
          content:
            'You are a JSON-only reasoning-graph extractor. Output ONLY valid JSON. No markdown, no explanation.',
        },
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

// --- Simulated LLM response (no API key fallback) ---

function simulateLLMResponse(_prompt: string): string {
  return JSON.stringify({
    nodes: [
      {
        id: 'n1',
        type: 'claim',
        title: 'Ocean is the origin of life',
        content:
          'All known life on Earth traces its evolutionary lineage back to marine organisms.',
        author: 'Speaker 1',
        dependsOn: [],
      },
      {
        id: 'n2',
        type: 'fact',
        title: 'Hydrothermal vents discovered 1977',
        content:
          'Deep-sea hydrothermal vent ecosystems host chemosynthetic life.',
        author: 'Speaker 2',
        dependsOn: [],
        factKey: 'hydrothermal_vents_1977',
      },
      {
        id: 'n3',
        type: 'question',
        title: 'Could life exist without water?',
        content:
          'Are there alternative solvents that could support biochemistry?',
        author: 'Speaker 1',
        dependsOn: ['n1'],
      },
      {
        id: 'n4',
        type: 'decision',
        title: 'Focus on Earth-origin hypothesis',
        content:
          'Ground all arguments in terrestrial biology before expanding to exobiology.',
        author: 'Speaker 2',
        dependsOn: ['n3'],
      },
      {
        id: 'n5',
        type: 'claim',
        title: 'Chemosynthesis predates photosynthesis',
        content:
          'The earliest metabolic pathways were chemosynthetic, using inorganic compounds from vents.',
        author: 'Speaker 1',
        dependsOn: ['n2'],
      },
      {
        id: 'n6',
        type: 'assumption',
        title: 'Earth conditions were necessary',
        content:
          'The specific conditions on early Earth (temperature, chemistry, energy sources) were required for abiogenesis.',
        author: 'Speaker 2',
        dependsOn: ['n1'],
      },
    ],
    edges: [
      {
        type: 'supports',
        source: 'n2',
        target: 'n1',
        label: 'evidence for',
      },
      {
        type: 'diverges',
        source: 'n3',
        target: 'n1',
        label: 'challenges scope of',
      },
      {
        type: 'refines',
        source: 'n4',
        target: 'n3',
        label: 'narrows to',
      },
      {
        type: 'supports',
        source: 'n5',
        target: 'n1',
        label: 'strengthens claim',
      },
      {
        type: 'depends_on',
        source: 'n5',
        target: 'n2',
        label: 'builds on fact',
      },
      {
        type: 'supports',
        source: 'n6',
        target: 'n1',
        label: 'contextual assumption',
      },
    ],
    canvasName: 'Origin of Life — Discussion',
    summary:
      'A discussion exploring the hypothesis that life originated in Earth\'s oceans. Speakers referenced hydrothermal vent discoveries from 1977 as supporting evidence, debated whether alternative biochemistries could exist without water, and agreed to ground the analysis in terrestrial biology first. The consensus was that chemosynthetic metabolism likely predates photosynthesis.',
  });
}

// --- Parse LLM response ---

function parseExtractionResult(raw: string): ExtractionResult {
  // Try to extract JSON from possible markdown code blocks
  let jsonStr = raw.trim();

  // Strip markdown code fences
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  const parsed = JSON.parse(jsonStr) as Partial<ExtractionResult>;

  if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
    throw new Error('LLM response missing "nodes" array');
  }
  if (!parsed.edges || !Array.isArray(parsed.edges)) {
    throw new Error('LLM response missing "edges" array');
  }

  // Validate node ids are unique
  const ids = new Set<string>();
  for (const node of parsed.nodes) {
    if (!node.id || ids.has(node.id)) {
      throw new Error(`Duplicate or missing node id: ${node.id}`);
    }
    ids.add(node.id);
  }

  return {
    nodes: parsed.nodes,
    edges: parsed.edges,
    canvasName: parsed.canvasName || 'Imported Canvas',
    summary: parsed.summary || '',
  };
}

// --- Build InosGraph from extraction ---

function buildGraph(
  result: ExtractionResult,
  positionedNodes: ReturnType<typeof forceLayout>
): InosGraph {
  const now = new Date().toISOString();
  const canvasId = uuidv4();
  const systemAuthor: NodeAuthor = { type: 'system', source: 'ingestion' };

  // Map ExtractedNode → InosNode
  const nodes: InosNode[] = positionedNodes.map((pn) => {
    const stringContent = pn.content;
    const author: NodeAuthor =
      pn.author === 'AI' || pn.author === 'Unknown'
        ? { type: 'agent', agentId: 'inos-ingestion', model: 'simulated' }
        : { type: 'human', userId: `ingested-${pn.author.toLowerCase().replace(/\s+/g, '-')}`, displayName: pn.author };

    return {
      id: uuidv4(),
      type: pn.type,
      title: pn.title,
      content: stringContent,
      author,
      createdAt: now,
      updatedAt: now,
      visits: [],
      dependsOn: [], // will be resolved below
      staleness: {
        state: 'fresh',
        evaluatedAt: now,
        cascadeDepth: 0,
      },
      canvasId,
      status: 'fresh',
      tags: ['ingested'],
      schemaVersion: '1.0.0',
      // Store original extraction id for edge resolution
      _extractionId: pn.id,
      // Store fact key if present
      ...(pn.factKey ? { engramMemoryId: pn.factKey } : {}),
    } as InosNode & { _extractionId: string };
  });

  // Build id map for edge resolution
  const extIdToInosId = new Map<string, string>();
  for (const node of nodes) {
    extIdToInosId.set((node as any)._extractionId, node.id);
  }

  // Map ExtractedEdge → InosEdge
  const edgeResults = result.edges
    .map((re) => {
      const sourceId = extIdToInosId.get(re.source);
      const targetId = extIdToInosId.get(re.target);
      if (!sourceId || !targetId) return null;

      const edge: InosEdge = {
        id: uuidv4(),
        type: re.type as InosEdge['type'],
        sourceId,
        targetId,
        label: re.label ?? undefined,
        createdAt: now,
        author: systemAuthor,
        canvasId,
        schemaVersion: '1.0.0',
      };
      return edge;
    })
    .filter((e): e is InosEdge => e !== null);

  const edges: InosEdge[] = edgeResults;

  // Resolve dependsOn on nodes
  for (const node of nodes) {
    const extNode = positionedNodes.find(
      (p) => p.id === (node as any)._extractionId
    );
    if (extNode) {
      node.dependsOn = extNode.dependsOn
        .map((d) => extIdToInosId.get(d))
        .filter(Boolean) as string[];
    }
    // Clean up internal field
    delete (node as any)._extractionId;
  }

  // Build canvas
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

function computeStats(graph: InosGraph): IngestStats {
  return {
    nodesExtracted: graph.nodes.length,
    edgesExtracted: graph.edges.length,
    factsExtracted: graph.nodes.filter((n) => n.type === 'fact').length,
    decisionsExtracted: graph.nodes.filter((n) => n.type === 'decision').length,
    questionsExtracted: graph.nodes.filter((n) => n.type === 'question').length,
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

  const rawResponse = await callLLM(prompt, model);
  const extraction = parseExtractionResult(rawResponse);

  console.log(
    `[ingestion] Extracted ${extraction.nodes.length} nodes, ${extraction.edges.length} edges`
  );

  const positionedNodes = forceLayout(extraction.nodes, extraction.edges);
  const graph = buildGraph(extraction, positionedNodes);
  const stats = computeStats(graph);

  return { graph, stats };
}
