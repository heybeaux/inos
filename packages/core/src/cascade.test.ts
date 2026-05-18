import { describe, it, expect } from 'vitest';
import { CascadeEngine } from './cascade.js';
import type { InosNode, InosGraph, Canvas } from '@heybeaux/inos-types';

function makeNode(
  id: string,
  overrides: Partial<InosNode> = {},
): InosNode {
  return {
    id,
    type: 'claim',
    title: id,
    content: id,
    author: { type: 'system', source: 'test' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    visits: [],
    dependsOn: [],
    staleness: {
      state: 'fresh',
      evaluatedAt: '2026-01-01T00:00:00.000Z',
      cascadeDepth: 0,
    },
    canvasId: 'c1',
    status: 'fresh',
    tags: [],
    schemaVersion: '1',
    ...overrides,
  };
}

function makeGraph(nodes: InosNode[]): InosGraph {
  const canvas: Canvas = {
    id: 'c1',
    name: 'test',
    author: { type: 'system', source: 'test' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    participants: [],
    tags: [],
    schemaVersion: '1',
  };
  return {
    schemaVersion: '1',
    canvas,
    nodes,
    edges: [],
    temporalIndex: [],
    factRegistry: {},
  };
}

describe('CascadeEngine', () => {
  it('propagates stale state from a single parent to its dependent', () => {
    const parent = makeNode('parent', {
      staleness: {
        state: 'stale',
        evaluatedAt: '2026-01-02T00:00:00.000Z',
        cascadeDepth: 0,
      },
    });
    const child = makeNode('child', { dependsOn: ['parent'] });
    const graph = makeGraph([parent, child]);

    const result = new CascadeEngine(graph).cascade('parent');

    expect(result.affectedNodeIds).toEqual(['child']);
    expect(result.staleNodeIds).toEqual(['child']);
    expect(child.staleness.state).toBe('stale');
    expect(child.staleness.triggeredBy).toBe('parent');
    expect(child.staleness.cascadeDepth).toBe(1);
  });

  it('marks a child stale when its parent has a newer updatedAt', () => {
    const parent = makeNode('parent', {
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    const child = makeNode('child', {
      dependsOn: ['parent'],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const graph = makeGraph([parent, child]);

    const result = new CascadeEngine(graph).cascade('parent');

    expect(result.staleNodeIds).toEqual(['child']);
    expect(child.staleness.state).toBe('stale');
  });

  it('negation from any parent wins over fresh siblings (multi-parent)', () => {
    const fresh1 = makeNode('fresh1');
    const negated = makeNode('negated', {
      staleness: {
        state: 'negated',
        evaluatedAt: '2026-01-02T00:00:00.000Z',
        cascadeDepth: 0,
      },
    });
    const fresh2 = makeNode('fresh2');
    const child = makeNode('child', {
      dependsOn: ['fresh1', 'negated', 'fresh2'],
    });
    const graph = makeGraph([fresh1, negated, fresh2, child]);

    const result = new CascadeEngine(graph).cascade('negated');

    expect(result.negatedNodeIds).toEqual(['child']);
    expect(result.affectedNodeIds).toEqual(['child']);
    expect(child.staleness.state).toBe('negated');
  });

  it('negation wins even when listed last in dependsOn', () => {
    const fresh1 = makeNode('fresh1');
    const fresh2 = makeNode('fresh2');
    const negated = makeNode('negated', {
      staleness: {
        state: 'negated',
        evaluatedAt: '2026-01-02T00:00:00.000Z',
        cascadeDepth: 0,
      },
    });
    const child = makeNode('child', {
      dependsOn: ['fresh1', 'fresh2', 'negated'],
    });
    const graph = makeGraph([fresh1, fresh2, negated, child]);

    const result = new CascadeEngine(graph).cascade('negated');

    expect(child.staleness.state).toBe('negated');
    expect(result.negatedNodeIds).toContain('child');
  });

  it('marks a node orphaned when a dependsOn id is missing from the graph', () => {
    const trigger = makeNode('trigger');
    const child = makeNode('child', { dependsOn: ['trigger', 'ghost'] });
    const graph = makeGraph([trigger, child]);

    const result = new CascadeEngine(graph).cascade('trigger');

    expect(result.orphanedNodeIds).toEqual(['child']);
    expect(child.staleness.state).toBe('orphaned');
  });

  it('preserves state when dependsOn is empty (does NOT mark orphaned)', () => {
    const root = makeNode('root');
    const sibling = makeNode('sibling', {
      dependsOn: [],
      staleness: {
        state: 'fresh',
        evaluatedAt: '2026-01-01T00:00:00.000Z',
        cascadeDepth: 0,
      },
    });
    const child = makeNode('child', { dependsOn: ['root'] });
    const graph = makeGraph([root, sibling, child]);

    new CascadeEngine(graph).cascade('root');

    expect(sibling.staleness.state).toBe('fresh');
    expect(sibling.dependsOn).toEqual([]);
  });

  it('cascades transitively: A -> B -> C, A negated makes C negated', () => {
    const a = makeNode('a', {
      staleness: {
        state: 'negated',
        evaluatedAt: '2026-01-02T00:00:00.000Z',
        cascadeDepth: 0,
      },
    });
    const b = makeNode('b', { dependsOn: ['a'] });
    const c = makeNode('c', { dependsOn: ['b'] });
    const graph = makeGraph([a, b, c]);

    const result = new CascadeEngine(graph).cascade('a');

    expect(result.affectedNodeIds).toEqual(['b', 'c']);
    expect(result.negatedNodeIds).toEqual(['b', 'c']);
    expect(b.staleness.state).toBe('negated');
    expect(c.staleness.state).toBe('negated');
    expect(b.staleness.cascadeDepth).toBe(1);
    expect(c.staleness.cascadeDepth).toBe(2);
  });

  it('populates all result arrays correctly for a mixed cascade', () => {
    const root = makeNode('root', {
      staleness: {
        state: 'stale',
        evaluatedAt: '2026-01-02T00:00:00.000Z',
        cascadeDepth: 0,
      },
    });
    const staleChild = makeNode('staleChild', { dependsOn: ['root'] });
    const negatedSibling = makeNode('negatedSibling', {
      staleness: {
        state: 'negated',
        evaluatedAt: '2026-01-02T00:00:00.000Z',
        cascadeDepth: 0,
      },
    });
    const negatedChild = makeNode('negatedChild', {
      dependsOn: ['root', 'negatedSibling'],
    });
    const orphanChild = makeNode('orphanChild', {
      dependsOn: ['root', 'ghost'],
    });
    const graph = makeGraph([
      root,
      staleChild,
      negatedSibling,
      negatedChild,
      orphanChild,
    ]);

    const result = new CascadeEngine(graph).cascade('root');

    expect(result.affectedNodeIds.sort()).toEqual(
      ['negatedChild', 'orphanChild', 'staleChild'].sort(),
    );
    expect(result.staleNodeIds).toEqual(['staleChild']);
    expect(result.negatedNodeIds).toEqual(['negatedChild']);
    expect(result.orphanedNodeIds).toEqual(['orphanChild']);
  });

  it('diamond dependency: A -> {B, C} -> D propagates D exactly once', () => {
    const a = makeNode('a', {
      staleness: {
        state: 'stale',
        evaluatedAt: '2026-01-02T00:00:00.000Z',
        cascadeDepth: 0,
      },
    });
    const b = makeNode('b', { dependsOn: ['a'] });
    const c = makeNode('c', { dependsOn: ['a'] });
    const d = makeNode('d', { dependsOn: ['b', 'c'] });
    const graph = makeGraph([a, b, c, d]);

    const result = new CascadeEngine(graph).cascade('a');

    // D must appear exactly once.
    const dOccurrences = result.affectedNodeIds.filter((id) => id === 'd');
    expect(dOccurrences).toHaveLength(1);

    // B and C must be evaluated before D in topological order.
    const idxB = result.affectedNodeIds.indexOf('b');
    const idxC = result.affectedNodeIds.indexOf('c');
    const idxD = result.affectedNodeIds.indexOf('d');
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxC).toBeGreaterThanOrEqual(0);
    expect(idxD).toBeGreaterThan(idxB);
    expect(idxD).toBeGreaterThan(idxC);

    // D inherits stale through both B and C.
    expect(d.staleness.state).toBe('stale');
    // Depth = max(B.depth, C.depth) + 1 = 2.
    expect(d.staleness.cascadeDepth).toBe(2);
  });

  it('triggeredBy on transitive descendants points at the root cause', () => {
    const a = makeNode('a', {
      staleness: {
        state: 'negated',
        evaluatedAt: '2026-01-02T00:00:00.000Z',
        cascadeDepth: 0,
      },
    });
    const b = makeNode('b', { dependsOn: ['a'] });
    const c = makeNode('c', { dependsOn: ['b'] });
    const d = makeNode('d', { dependsOn: ['c'] });
    const graph = makeGraph([a, b, c, d]);

    new CascadeEngine(graph).cascade('a');

    // Every transitive descendant should cite the original change ('a'),
    // not its immediate parent.
    expect(b.staleness.triggeredBy).toBe('a');
    expect(c.staleness.triggeredBy).toBe('a');
    expect(d.staleness.triggeredBy).toBe('a');
  });

  it('self-referential dependsOn does not cause an infinite loop', () => {
    const selfRef = makeNode('selfRef', { dependsOn: ['selfRef'] });
    const child = makeNode('child', { dependsOn: ['selfRef'] });
    const graph = makeGraph([selfRef, child]);

    const start = Date.now();
    const result = new CascadeEngine(graph).cascade('selfRef');
    const elapsed = Date.now() - start;

    // Must terminate quickly and not include the trigger as its own
    // dependent.
    expect(elapsed).toBeLessThan(500);
    expect(result.affectedNodeIds).not.toContain('selfRef');
    expect(result.affectedNodeIds).toContain('child');
  });

  it('no-op cascade (no dependents) does not pollute the temporal index', () => {
    const lonely = makeNode('lonely');
    const sibling = makeNode('sibling'); // does NOT depend on lonely
    const graph = makeGraph([lonely, sibling]);
    const initialLen = graph.temporalIndex.length;

    const result = new CascadeEngine(graph).cascade('lonely');

    expect(result.affectedNodeIds).toEqual([]);
    expect(graph.temporalIndex.length).toBe(initialLen);
  });

  it('repeated no-op cascades keep the temporal index bounded', () => {
    const lonely = makeNode('lonely');
    const graph = makeGraph([lonely]);
    const engine = new CascadeEngine(graph);

    for (let i = 0; i < 100; i++) engine.cascade('lonely');

    expect(graph.temporalIndex.length).toBe(0);
  });
});
