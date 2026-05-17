/**
 * Strict validation for raw LLM extraction output.
 *
 * The extractor returns JSON like `{ nodes, edges, canvasName, summary }`.
 * Until P1.2, the parser only checked that the top-level arrays existed
 * and node ids were unique, then blind-cast into `InosNode`/`InosEdge`.
 *
 * This file defines:
 *   - zod schemas keyed off the source-of-truth `NodeType` / `EdgeType`
 *     unions from `@heybeaux/inos-types`
 *   - `ExtractionSchemaError`, a typed error carrying zod issues + a
 *     truncated raw payload, for upstream retry / 502 mapping
 *   - `validateExtractionResult`, which runs zod, drops dangling edges
 *     (refs to unknown node ids) with a warning, and rejects empty graphs
 */

import { z } from 'zod';
import type { NodeType, EdgeType } from '@heybeaux/inos-types';

// --- Source-of-truth enum values ---
//
// These are listed explicitly here (rather than re-derived from the
// types package) because TypeScript string-literal unions don't survive
// into the runtime. The `satisfies readonly NodeType[]` line gives us a
// compile-time guarantee that this list stays exhaustive: if a new
// member is added to `NodeType`/`EdgeType` in @heybeaux/inos-types and
// not added here, the build breaks. P1.3 owns types-package changes, so
// this is the agreed seam.

export const NODE_TYPE_VALUES = [
  'claim',
  'question',
  'decision',
  'evidence',
  'branch',
  'synthesis',
  'deliberation',
  'constraint',
  'assumption',
  'insight',
  'artifact',
  'fact',
] as const satisfies readonly NodeType[];

export const EDGE_TYPE_VALUES = [
  'supports',
  'challenges',
  'refines',
  'diverges',
  'merges',
  'depends_on',
  'references',
  'temporal',
  'replaces',
  'inherits',
] as const satisfies readonly EdgeType[];

// zod enums (strict membership). Coercion to lowercase happens in the
// `type` preprocess below, so e.g. `"Claim"` from the LLM is normalized
// before enum membership is checked.
const nodeTypeEnum = z.enum(NODE_TYPE_VALUES);
const edgeTypeEnum = z.enum(EDGE_TYPE_VALUES);

/** Lowercase-coerce a `type` field before strict enum validation. */
const lowercaseCoerce = (val: unknown): unknown =>
  typeof val === 'string' ? val.toLowerCase() : val;

// --- Schemas ---

export const extractionNodeSchema = z.object({
  id: z.string().min(1, 'node id is required'),
  type: z.preprocess(lowercaseCoerce, nodeTypeEnum),
  title: z.string().min(1, 'node title is required'),
  content: z.string(),
  author: z.string().min(1, 'node author is required'),
  // CodeRabbit prior finding: many LLM outputs omit dependsOn entirely.
  // Default to [] rather than rejecting; the prompt still asks for it.
  dependsOn: z.array(z.string()).default([]),
  factKey: z.string().optional(),
  // P1.3 hand-off: verbatim source excerpt (5-40 words). The post-validation
  // pipeline resolves this into a NodeSourceSpan via `resolveSourceSpan` and
  // then strips the raw excerpt before constructing the final InosNode.
  excerpt: z.string().optional(),
});

export const extractionEdgeSchema = z.object({
  type: z.preprocess(lowercaseCoerce, edgeTypeEnum),
  source: z.string().min(1, 'edge source is required'),
  target: z.string().min(1, 'edge target is required'),
  label: z.string().optional(),
});

export const extractionResultSchema = z.object({
  nodes: z.array(extractionNodeSchema),
  edges: z.array(extractionEdgeSchema),
  canvasName: z.string().optional().default('Imported Canvas'),
  summary: z.string().optional().default(''),
});

export type ValidatedExtractionNode = z.infer<typeof extractionNodeSchema>;
export type ValidatedExtractionEdge = z.infer<typeof extractionEdgeSchema>;
export type ValidatedExtractionResult = z.infer<typeof extractionResultSchema>;

// --- Typed error ---

export interface ExtractionSchemaIssue {
  path: (string | number)[];
  message: string;
  code: string;
}

export class ExtractionSchemaError extends Error {
  readonly code = 'EXTRACTION_SCHEMA_INVALID' as const;
  readonly issues: ExtractionSchemaIssue[];
  /** Truncated (~2KB) raw payload for debugging. */
  readonly rawPayload: string;

  constructor(
    issues: ExtractionSchemaIssue[],
    rawPayload: string,
    message?: string,
  ) {
    super(
      message ??
        `Extraction schema invalid: ${issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
          .join('; ')}`,
    );
    this.name = 'ExtractionSchemaError';
    this.issues = issues;
    this.rawPayload = rawPayload;
  }

  /** Short, embeddable summary for the retry system prompt. */
  summaryForLLM(): string {
    return this.issues
      .slice(0, 10)
      .map(
        (i) =>
          `- at ${i.path.length ? i.path.join('.') : '<root>'}: ${i.message}`,
      )
      .join('\n');
  }
}

// --- Public validator ---

const RAW_PAYLOAD_MAX_BYTES = 2048;

export function truncateRawPayload(raw: string): string {
  if (raw.length <= RAW_PAYLOAD_MAX_BYTES) return raw;
  return raw.slice(0, RAW_PAYLOAD_MAX_BYTES) + '...[truncated]';
}

export interface ValidateOptions {
  /** Original raw LLM text (post fence-strip) used for error payload. */
  rawPayload: string;
  /** Override the default `console.warn` for dropped-edge tracking. */
  onDroppedEdge?: (msg: string) => void;
}

export interface ValidationOutput {
  result: ValidatedExtractionResult;
  edgesDropped: number;
}

/**
 * Validate a parsed (object) LLM payload.
 *
 * Order of checks:
 *   1. Zod schema (types, enums, required fields, dependsOn default)
 *   2. Empty `nodes` array → reject
 *   3. Duplicate node ids → reject
 *   4. Edges referencing unknown node ids → drop with warning, track count
 *   5. Also resolve `dependsOn` entries: unknown refs dropped silently
 *      (they're not edges and don't degrade graph integrity)
 */
export function validateExtractionResult(
  parsedJson: unknown,
  options: ValidateOptions,
): ValidationOutput {
  const parsed = extractionResultSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issues: ExtractionSchemaIssue[] = parsed.error.issues.map((i) => ({
      path: [...i.path] as (string | number)[],
      message: i.message,
      code: i.code,
    }));
    throw new ExtractionSchemaError(
      issues,
      truncateRawPayload(options.rawPayload),
    );
  }

  const result = parsed.data;

  if (result.nodes.length === 0) {
    throw new ExtractionSchemaError(
      [
        {
          path: ['nodes'],
          message: 'nodes array is empty; refusing to build zero-node graph',
          code: 'custom',
        },
      ],
      truncateRawPayload(options.rawPayload),
    );
  }

  const ids = new Set<string>();
  for (const node of result.nodes) {
    if (ids.has(node.id)) {
      throw new ExtractionSchemaError(
        [
          {
            path: ['nodes'],
            message: `duplicate node id: "${node.id}"`,
            code: 'custom',
          },
        ],
        truncateRawPayload(options.rawPayload),
      );
    }
    ids.add(node.id);
  }

  // Drop dangling edges.
  const warn = options.onDroppedEdge ?? ((m: string) => console.warn(m));
  const keptEdges: ValidatedExtractionEdge[] = [];
  let edgesDropped = 0;
  for (const edge of result.edges) {
    const sourceOk = ids.has(edge.source);
    const targetOk = ids.has(edge.target);
    if (!sourceOk || !targetOk) {
      edgesDropped += 1;
      const missing = [
        !sourceOk ? `source="${edge.source}"` : null,
        !targetOk ? `target="${edge.target}"` : null,
      ]
        .filter(Boolean)
        .join(' ');
      warn(
        `[ingestion] Dropping edge ${edge.type} ${edge.source}->${edge.target} (missing ${missing})`,
      );
      continue;
    }
    keptEdges.push(edge);
  }

  // Also prune dangling dependsOn refs on nodes (silent — not an edge).
  const nodes: ValidatedExtractionNode[] = result.nodes.map((n) => ({
    ...n,
    dependsOn: n.dependsOn.filter((d) => ids.has(d)),
  }));

  return {
    result: {
      nodes,
      edges: keptEdges,
      canvasName: result.canvasName,
      summary: result.summary,
    },
    edgesDropped,
  };
}
