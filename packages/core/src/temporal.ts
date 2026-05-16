import type { InosGraph, InosNode, InosEdge, TemporalSnapshot } from '@heybeaux/inos-types';

export class TemporalEngine {
  static createSnapshot(graph: InosGraph): TemporalSnapshot {
    const lastSnapshot = graph.temporalIndex.at(-1);
    const now = new Date().toISOString();

    if (!lastSnapshot) {
      return {
        timestamp: now,
        changedNodes: graph.nodes.map((n: InosNode) => n.id),
        changedEdges: graph.edges.map((e: InosEdge) => e.id),
        delta: {
          nodes: graph.nodes.map((n: InosNode) => ({ ...n })),
          edges: graph.edges.map((e: InosEdge) => ({ ...e })),
        },
      };
    }

    const changedNodes = graph.nodes.filter((n: InosNode) => n.updatedAt >= lastSnapshot.timestamp);
    const changedEdges = graph.edges.filter((e: InosEdge) => e.createdAt >= lastSnapshot.timestamp);

    return {
      timestamp: now,
      changedNodes: changedNodes.map((n: InosNode) => n.id),
      changedEdges: changedEdges.map((e: InosEdge) => e.id),
      delta: {
        nodes: changedNodes.map((n: InosNode) => ({ ...n })),
        edges: changedEdges.map((e: InosEdge) => ({ ...e })),
      },
    };
  }

  static replay(graph: InosGraph, targetTime: string): InosGraph | null {
    const snapshots = graph.temporalIndex;
    if (snapshots.length === 0) return null;

    const firstSnapshotIdx = snapshots.findIndex((s: TemporalSnapshot) => s.timestamp >= targetTime);
    if (firstSnapshotIdx === -1) return { ...graph };

    const replayed = this.createBaseGraph(graph);
    for (let i = 0; i < firstSnapshotIdx; i++) {
      this.applySnapshot(replayed, snapshots[i]);
    }

    return replayed;
  }

  static getStateAt(graph: InosGraph, time: string): InosGraph | null {
    return this.replay(graph, time);
  }

  private static createBaseGraph(graph: InosGraph): InosGraph {
    return {
      schemaVersion: graph.schemaVersion,
      canvas: { ...graph.canvas },
      nodes: [],
      edges: [],
      temporalIndex: [],
      factRegistry: {},
    };
  }

  private static applySnapshot(graph: InosGraph, snapshot: TemporalSnapshot): void {
    for (const node of snapshot.delta.nodes) {
      const idx = graph.nodes.findIndex((n: InosNode) => n.id === node.id);
      if (idx >= 0) {
        graph.nodes[idx] = { ...node };
      } else {
        graph.nodes.push({ ...node });
      }
    }

    for (const edge of snapshot.delta.edges) {
      const existing = graph.edges.find((e: InosEdge) => e.id === edge.id);
      if (!existing) {
        graph.edges.push({ ...edge });
      }
    }
  }
}
