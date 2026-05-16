
import { describe, it, expect } from 'vitest';
import { InosGraphEngine } from './graph.js';
import type { InosNode, InosEdge } from '@heybeaux/inos-types';

describe('InosGraphEngine', () => {
  it('should initialize an empty graph', () => {
    const engine = new InosGraphEngine();
    expect(engine).toBeDefined();
  });

  it('should add a node to the graph', () => {
    const engine = new InosGraphEngine();
    const node: InosNode = {
      id: 'node1',
      type: 'claim',
      title: 'Test Claim',
      content: 'This is a test claim.',
      author: { type: 'human', userId: 'user1', displayName: 'Test User' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      visits: [],
      dependsOn: [],
      staleness: { state: 'fresh', evaluatedAt: new Date().toISOString(), cascadeDepth: 0 },
      canvasId: 'canvas1',
      status: 'fresh',
      tags: [],
      schemaVersion: '1',
    };
    engine.addNode(node);
    expect(engine.getNode('node1')).toEqual(node);
  });

  it('should add an edge and detect cycles', () => {
    const engine = new InosGraphEngine();
    const node1: InosNode = { id: 'node1', type: 'claim', title: 'N1', content: 'c1', author: {type: 'system', source: 'test'}, createdAt: 't', updatedAt: 't', visits: [], dependsOn: [], staleness: {state: 'fresh', evaluatedAt: 't', cascadeDepth: 0}, canvasId: 'c1', status: 'fresh', tags:[], schemaVersion: '1'};
    const node2: InosNode = { id: 'node2', type: 'claim', title: 'N2', content: 'c2', author: {type: 'system', source: 'test'}, createdAt: 't', updatedAt: 't', visits: [], dependsOn: [], staleness: {state: 'fresh', evaluatedAt: 't', cascadeDepth: 0}, canvasId: 'c1', status: 'fresh', tags:[], schemaVersion: '1'};
    const edge: InosEdge = { id: 'edge1', type: 'supports', sourceId: 'node1', targetId: 'node2', createdAt: 't', author: {type: 'system', source: 'test'}, canvasId: 'c1', schemaVersion: '1'};
    engine.addNode(node1);
    engine.addNode(node2);
    engine.addEdge(edge);

    const cycleEdge: InosEdge = { id: 'edge2', type: 'supports', sourceId: 'node2', targetId: 'node1', createdAt: 't', author: {type: 'system', source: 'test'}, canvasId: 'c1', schemaVersion: '1'};
    expect(() => engine.addEdge(cycleEdge)).toThrow('Cycle detected in graph. Inos graphs must be DAGs.');
  });
});
