/**
 * OpenRouter `response_format: json_schema` payloads for each extraction pass.
 *
 * Why these live here and not in `schema.ts`: `schema.ts` carries the *zod*
 * post-validation pipeline (catches whatever the LLM actually returns).
 * These are the *generation-time* JSON Schemas that get sent to providers
 * that honor structured output (OpenAI, Gemini, some others). Providers
 * that don't honor it — notably Anthropic-via-OpenRouter — silently fall
 * back to `json_object` mode, and our zod pipeline + parse-retry catches
 * the slack. Both layers are intentional (per the Parliament deliberation,
 * a24184eb).
 */
import { NODE_TYPE_VALUES, EDGE_TYPE_VALUES } from './schema.js';

type JsonSchema = Record<string, unknown>;

/** Shared node sub-schema used by spine / support / recovery passes. */
const rawNodeSchema: JsonSchema = {
  type: 'object',
  required: ['id', 'type', 'title', 'content'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: [...NODE_TYPE_VALUES] },
    title: { type: 'string', minLength: 1, maxLength: 240 },
    content: { type: 'string' },
    author: { type: 'string' },
    factKey: { type: 'string' },
    excerpt: { type: 'string' },
  },
};

const rawEdgeSchema: JsonSchema = {
  type: 'object',
  required: ['type', 'source', 'target'],
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: [...EDGE_TYPE_VALUES] },
    source: { type: 'string', minLength: 1 },
    target: { type: 'string', minLength: 1 },
    label: { type: 'string' },
  },
};

export const spineJsonSchema: JsonSchema = {
  type: 'object',
  required: ['nodes'],
  additionalProperties: false,
  properties: {
    canvasName: { type: 'string' },
    summary: { type: 'string' },
    nodes: { type: 'array', items: rawNodeSchema },
  },
};

export const supportJsonSchema: JsonSchema = {
  type: 'object',
  required: ['nodes'],
  additionalProperties: false,
  properties: {
    nodes: { type: 'array', items: rawNodeSchema },
  },
};

export const edgesJsonSchema: JsonSchema = {
  type: 'object',
  required: ['edges'],
  additionalProperties: false,
  properties: {
    edges: { type: 'array', items: rawEdgeSchema },
  },
};

export const recoveryJsonSchema: JsonSchema = {
  type: 'object',
  required: ['missedNodes'],
  additionalProperties: false,
  properties: {
    missedNodes: { type: 'array', items: rawNodeSchema },
  },
};

export const consolidationJsonSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    canvasName: { type: 'string' },
    summary: { type: 'string' },
    keepNodeIds: { type: 'array', items: { type: 'string' } },
    renameNodes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
        },
      },
    },
    extraEdges: { type: 'array', items: rawEdgeSchema },
  },
};

export const repairJsonSchema: JsonSchema = {
  type: 'object',
  required: ['nodes', 'edges'],
  additionalProperties: false,
  properties: {
    nodes: { type: 'array', items: rawNodeSchema },
    edges: { type: 'array', items: rawEdgeSchema },
    canvasName: { type: 'string' },
    summary: { type: 'string' },
  },
};
