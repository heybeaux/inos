import { beforeEach, describe, expect, it } from 'vitest';
import { useGraphStore } from './store';

// Smoke tests for the zustand graph store. These cover pure reducer
// behavior (addNode / deleteNode / editNode / loadDemo) without touching
// the 3D canvas. No GL context required.

function resetStore(): void {
  useGraphStore.setState({
    nodes: [],
    edges: [],
    canvasName: 'Inos',
    summary: null,
    factsTable: null,
    focusedNodeId: null,
    hoveredNodeId: null,
    selectedNodeId: null,
    activePanel: 'none',
    selectedNode: null,
    timelineProgress: 100,
    visibleNodeIds: null,
    commandPaletteOpen: false,
    contextMenu: { open: false, x: 0, y: 0, nodeId: null, mergeMode: false },
    inlineEditId: null,
    toolbarPlacementMode: null,
    showFactsPanel: false,
    showSummaryPanel: false,
    showTimelinePanel: false,
  });
}

describe('useGraphStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('addNode', () => {
    it('appends a node with sane defaults', () => {
      const node = useGraphStore.getState().addNode({
        title: 'Hello',
        content: 'world',
      });

      const nodes = useGraphStore.getState().nodes;
      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toBe(node);
      expect(node.id).toMatch(/^node-/);
      expect(node.type).toBe('claim');
      expect(node.status).toBe('fresh');
      expect(node.staleness.state).toBe('fresh');
      expect(node.dependsOn).toEqual([]);
      expect(node.createdAt).toBeTruthy();
      expect(node.updatedAt).toBeTruthy();
    });

    it('respects an explicit id and type', () => {
      const node = useGraphStore
        .getState()
        .addNode({ id: 'my-id', type: 'fact', title: 'Pinned' });

      expect(node.id).toBe('my-id');
      expect(node.type).toBe('fact');
      expect(useGraphStore.getState().nodes[0].id).toBe('my-id');
    });

    it('does not mutate previous node list reference', () => {
      const before = useGraphStore.getState().nodes;
      useGraphStore.getState().addNode({ title: 'A' });
      const after = useGraphStore.getState().nodes;
      expect(after).not.toBe(before);
      expect(after).toHaveLength(1);
    });
  });

  describe('deleteNode (logical remove)', () => {
    it('marks the target as orphaned and drops touching edges', () => {
      const store = useGraphStore.getState();
      const a = store.addNode({ id: 'a', title: 'A' });
      const b = store.addNode({ id: 'b', title: 'B' });
      const c = store.addNode({ id: 'c', title: 'C' });
      store.addEdge({ id: 'e1', sourceId: a.id, targetId: b.id, type: 'supports' });
      store.addEdge({ id: 'e2', sourceId: b.id, targetId: c.id, type: 'supports' });
      store.addEdge({ id: 'e3', sourceId: a.id, targetId: c.id, type: 'supports' });

      useGraphStore.getState().deleteNode('b');

      const { nodes, edges } = useGraphStore.getState();
      expect(nodes.find((n) => n.id === 'b')?.status).toBe('orphaned');
      expect(nodes.find((n) => n.id === 'a')?.status).toBe('fresh');
      expect(edges.map((e) => e.id).sort()).toEqual(['e3']);
    });

    it('is a no-op when the id does not exist', () => {
      const store = useGraphStore.getState();
      store.addNode({ id: 'a', title: 'A' });
      const before = useGraphStore.getState().nodes.length;

      useGraphStore.getState().deleteNode('ghost');

      const after = useGraphStore.getState().nodes;
      expect(after).toHaveLength(before);
      expect(after.every((n) => n.status !== 'orphaned')).toBe(true);
    });
  });

  describe('editNode (update)', () => {
    it('patches fields and refreshes updatedAt', async () => {
      const node = useGraphStore.getState().addNode({ id: 'a', title: 'old' });
      const originalUpdated = node.updatedAt;

      // Tick the clock so the new updatedAt is provably distinct.
      await new Promise((r) => setTimeout(r, 5));

      useGraphStore.getState().editNode('a', { title: 'new', content: 'body' });

      const after = useGraphStore.getState().nodes.find((n) => n.id === 'a');
      expect(after?.title).toBe('new');
      expect(after?.content).toBe('body');
      expect(after?.updatedAt).not.toBe(originalUpdated);
    });

    it('does not touch other nodes', () => {
      const store = useGraphStore.getState();
      store.addNode({ id: 'a', title: 'A' });
      store.addNode({ id: 'b', title: 'B' });

      useGraphStore.getState().editNode('a', { title: 'A!' });

      const b = useGraphStore.getState().nodes.find((n) => n.id === 'b');
      expect(b?.title).toBe('B');
    });
  });

  describe('loadDemo', () => {
    it('populates nodes, edges, and a canvas name', () => {
      useGraphStore.getState().loadDemo();
      const { nodes, edges, canvasName } = useGraphStore.getState();
      expect(nodes.length).toBeGreaterThan(0);
      expect(edges.length).toBeGreaterThan(0);
      expect(canvasName).toBeTruthy();
      expect(typeof canvasName).toBe('string');
    });

    it('clears any timeline-visibility filter (full graph visible)', () => {
      useGraphStore.setState({ visibleNodeIds: new Set(['ghost']) });
      useGraphStore.getState().loadDemo();
      expect(useGraphStore.getState().visibleNodeIds).toBeNull();
    });
  });
});
