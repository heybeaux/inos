import { describe, expect, it, vi } from 'vitest';
import {
  ExtractionSchemaError,
  extractionNodeSchema,
  extractionResultSchema,
  validateExtractionResult,
} from './schema.js';

const RAW = '{"...": "raw payload used for error reporting"}';

function validNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    type: 'claim',
    title: 'A claim',
    content: 'content',
    author: 'Alice',
    dependsOn: [],
    ...overrides,
  };
}

describe('extractionResultSchema (zod surface)', () => {
  it('accepts a valid extraction', () => {
    const input = {
      nodes: [validNode(), validNode({ id: 'n2', type: 'fact' })],
      edges: [{ type: 'supports', source: 'n1', target: 'n2' }],
      canvasName: 'Canvas',
      summary: 'Summary',
    };
    const result = extractionResultSchema.parse(input);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });

  it('defaults missing dependsOn to []', () => {
    const node = extractionNodeSchema.parse({
      id: 'n1',
      type: 'claim',
      title: 't',
      content: 'c',
      author: 'A',
    });
    expect(node.dependsOn).toEqual([]);
  });

  it('lowercase-coerces NodeType values', () => {
    const node = extractionNodeSchema.parse({
      id: 'n1',
      type: 'Claim',
      title: 't',
      content: 'c',
      author: 'A',
    });
    expect(node.type).toBe('claim');
  });

  it('lowercase-coerces EdgeType values', () => {
    const parsed = extractionResultSchema.parse({
      nodes: [validNode(), validNode({ id: 'n2' })],
      edges: [{ type: 'Supports', source: 'n1', target: 'n2' }],
    });
    expect(parsed.edges[0].type).toBe('supports');
  });
});

describe('validateExtractionResult', () => {
  it('rejects unknown NodeType with a field-level error', () => {
    const bad = {
      nodes: [validNode({ type: 'wisdom' })],
      edges: [],
    };
    let caught: unknown;
    try {
      validateExtractionResult(bad, { rawPayload: RAW });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExtractionSchemaError);
    const err = caught as ExtractionSchemaError;
    expect(err.code).toBe('EXTRACTION_SCHEMA_INVALID');
    // Path should point at the offending node's `type` field.
    const issue = err.issues.find((i) => i.path.includes('type'));
    expect(issue).toBeDefined();
    expect(issue?.path).toEqual(['nodes', 0, 'type']);
  });

  it('drops edges referencing missing node ids and tracks count (no throw)', () => {
    const onDroppedEdge = vi.fn();
    const out = validateExtractionResult(
      {
        nodes: [validNode()],
        edges: [
          { type: 'supports', source: 'n1', target: 'n-missing' },
          { type: 'refines', source: 'n-also-missing', target: 'n1' },
        ],
      },
      { rawPayload: RAW, onDroppedEdge },
    );
    expect(out.edgesDropped).toBe(2);
    expect(out.result.edges).toHaveLength(0);
    expect(onDroppedEdge).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate node ids', () => {
    let caught: unknown;
    try {
      validateExtractionResult(
        {
          nodes: [validNode(), validNode()],
          edges: [],
        },
        { rawPayload: RAW },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExtractionSchemaError);
    const err = caught as ExtractionSchemaError;
    expect(err.issues[0].message).toMatch(/duplicate/i);
  });

  it('rejects empty nodes array', () => {
    let caught: unknown;
    try {
      validateExtractionResult(
        { nodes: [], edges: [] },
        { rawPayload: RAW },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExtractionSchemaError);
    const err = caught as ExtractionSchemaError;
    expect(err.issues[0].path).toEqual(['nodes']);
    expect(err.issues[0].message).toMatch(/empty/i);
  });

  it('defaults missing dependsOn to [] through full pipeline', () => {
    const out = validateExtractionResult(
      {
        // Note: dependsOn omitted from the node entirely.
        nodes: [
          {
            id: 'n1',
            type: 'claim',
            title: 't',
            content: 'c',
            author: 'A',
          },
        ],
        edges: [],
      },
      { rawPayload: RAW },
    );
    expect(out.result.nodes[0].dependsOn).toEqual([]);
  });

  it('accepts "Claim" (lowercase coercion) end-to-end', () => {
    const out = validateExtractionResult(
      {
        nodes: [validNode({ type: 'Claim' })],
        edges: [],
      },
      { rawPayload: RAW },
    );
    expect(out.result.nodes[0].type).toBe('claim');
  });

  it('prunes dangling dependsOn refs silently', () => {
    const out = validateExtractionResult(
      {
        nodes: [
          validNode({ id: 'n1', dependsOn: ['n-missing', 'n2'] }),
          validNode({ id: 'n2' }),
        ],
        edges: [],
      },
      { rawPayload: RAW },
    );
    expect(out.result.nodes[0].dependsOn).toEqual(['n2']);
    expect(out.edgesDropped).toBe(0);
  });

  it('truncates rawPayload in ExtractionSchemaError', () => {
    const huge = 'x'.repeat(10_000);
    let caught: unknown;
    try {
      validateExtractionResult(
        { nodes: 'not-an-array' },
        { rawPayload: huge },
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ExtractionSchemaError);
    const err = caught as ExtractionSchemaError;
    expect(err.rawPayload.length).toBeLessThanOrEqual(2048 + 20);
    expect(err.rawPayload).toMatch(/truncated/);
  });
});
